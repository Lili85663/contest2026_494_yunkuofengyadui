#!/usr/bin/env python3
"""Loopback-only development bridge. Never logs prompts, replies or credentials."""
import json
import threading
import time
import uuid
import socket
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG = Path.home() / '.config/wrist-rhythm/mimo.json'
LOCK = threading.Lock()
HEALTH_LOCK = threading.Lock()
CONTROL = threading.Lock()
JOBS = {}
RECENT = []
STATUS = {"requests": 0, "successes": 0, "last_status": None, "last_error": None, "last_elapsed_ms": None}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path.startswith('/plan/'):
            job = JOBS.get(self.path[6:])
            if not job: return self.respond(404, {'error': 'job_not_found'})
            return self.respond(job['code'], job['body'])
        if self.path != '/status':
            return self.respond(404, {'error': 'not_found'})
        self.respond(200, {'configured': CONFIG.exists(), 'model': 'mimo-v2.5-pro', 'bridge': STATUS})

    def do_POST(self):
        STATUS['requests'] += 1
        if self.path != '/plan':
            return self.respond(404, {'error': 'not_found'})
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.respond(415, {'error': 'json_required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16000:
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            query = body['query']
            kind = body.get('kind', 'plan')
            if kind not in ('plan', 'health'): raise ValueError()
            if not isinstance(query, str) or not 1 <= len(query) <= 4000:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            return self.respond(400, {'error': 'invalid_request'})
        lock = HEALTH_LOCK if kind == 'health' else LOCK
        if not lock.acquire(False):
            return self.respond(429, {'error': 'busy'})
        with CONTROL:
            now = time.monotonic()
            RECENT[:] = [t for t in RECENT if now - t < 60]
            if len(RECENT) >= 10:
                lock.release()
                return self.respond(429, {'error': 'rate_limit'})
            RECENT.append(now)
            for old in list(JOBS):
                if now - JOBS[old]['at'] > 120: del JOBS[old]
            job_id = uuid.uuid4().hex
            JOBS[job_id] = {'at': now, 'code': 202, 'body': {'pending': True}}
        threading.Thread(target=run_job, args=(job_id, query, kind), daemon=True).start()
        self.respond(202, {'job': job_id})


def run_job(job_id, query, kind='plan'):
    started = time.monotonic()
    lock = HEALTH_LOCK if kind == 'health' else LOCK
    def finish(code, body):
        JOBS[job_id].update(code=code, body=body)
        STATUS['last_status'] = code
        STATUS['last_error'] = body.get('error')
        STATUS['last_elapsed_ms'] = round((time.monotonic()-started)*1000)
        if code == 200: STATUS['successes'] += 1
    try:
        try:
            config = json.loads(CONFIG.read_text())
            key = config['api_key']
            if not isinstance(key, str) or not key: raise ValueError()
        except (OSError, ValueError, KeyError, TypeError):
            return finish(503, {'error': 'not_configured'})
        system = '你是学习计划助手。只输出符合用户格式要求的 JSON 学习模块数组，不输出 Markdown，不作医疗诊断。'
        if kind == 'health':
            system = '你是健康提醒助手，不是医生。只输出不超过60个汉字的两句简短建议。不能凭心率血氧压力诊断疾病，不开药。强调休息复测；明显不适应及时就医。模拟回放必须说明回放，不声称用户患病。'
        payload = {
            'model': 'mimo-v2.5-pro',
            'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': query}],
            'max_completion_tokens': 192 if kind == 'health' else 1536,
            'thinking': {'type': 'disabled'},
            'temperature': 1.0, 'top_p': 0.95, 'stream': False,
        }
        request = urllib.request.Request(
            'https://api.xiaomimimo.com/v1/chat/completions',
            data=json.dumps(payload).encode('utf-8'),
            headers={'api-key': key, 'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=10 if kind == 'health' else 40) as response:
                result = json.loads(response.read(256000))
            reply = result['choices'][0]['message']['content']
            if not isinstance(reply, str) or not reply.strip(): return finish(502, {'error': 'upstream_empty'})
            finish(200, {'reply': reply, 'source': 'MiMo'})
        except urllib.error.HTTPError as error:
            finish(502, {'error': 'upstream_http', 'upstream_status': error.code})
        except (TimeoutError, socket.timeout):
            finish(504, {'error': 'upstream_timeout'})
        except Exception:
            finish(502, {'error': 'upstream_unavailable'})
    finally:
        lock.release()

if __name__ == '__main__':
    # Guest QEMU reaches the host loopback via 10.0.2.2. No LAN listener.
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
