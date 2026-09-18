"""Local protocol tests. No real MiMo requests or credentials."""
import importlib.util, io, json, tempfile, threading, time, unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
spec = importlib.util.spec_from_file_location('gateway', Path(__file__).resolve().parents[1] / 'scripts/mimo-gateway.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
class GatewayTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        g.CONFIG = Path(self.tmp.name) / 'config.json'
        g.CONFIG.write_text(json.dumps({'api_key': 'unit-test-placeholder'}))
        g.RECENT.clear(); g.JOBS.clear(); g.STATUS.update(requests=0,successes=0,last_status=None)
        self.server = ThreadingHTTPServer(('127.0.0.1',0),g.Handler)
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.tmp.cleanup()
    def call(self,path,data=None,content='application/json'):
        req=Request(self.base+path,data=data,headers={'Content-Type':content})
        try:
            with urlopen(req,timeout=2) as r:return r.status,json.loads(r.read())
        except HTTPError as e:return e.code,json.loads(e.read())
    def wait_result(self,job):
        for _ in range(100):
            code,body=self.call('/plan/'+job)
            if code!=202:return code,body
            time.sleep(.01)
        self.fail('job never finished')
    def test_async_reply_and_private_status(self):
        entered=threading.Event(); release=threading.Event()
        def upstream(req,timeout):
            entered.set(); release.wait(2)
            return io.BytesIO(json.dumps({'choices':[{'message':{'content':'[]'}}]}).encode())
        with patch.object(g.urllib.request,'urlopen',side_effect=upstream):
            code,body=self.call('/plan',b'{"query":"math"}')
            self.assertEqual(code,202); self.assertTrue(entered.wait(1))
            self.assertEqual(self.call('/plan/'+body['job'])[0],202)
            self.assertEqual(self.call('/plan',b'{"query":"math"}')[0],429)
            release.set(); self.assertEqual(self.wait_result(body['job']),(200,{'reply':'[]','source':'MiMo'}))
        status=self.call('/status')[1]
        self.assertEqual(status['bridge']['successes'],1)
        self.assertNotIn('unit-test-placeholder',json.dumps(status))
    def test_error_does_not_return_upstream_body(self):
        err=HTTPError('https://example.invalid',401,'bad',{},io.BytesIO(b'private-upstream-data'))
        with patch.object(g.urllib.request,'urlopen',side_effect=err):
            code,body=self.call('/plan',b'{"query":"math"}')
            code,result=self.wait_result(body['job'])
        self.assertEqual(code,502); self.assertEqual(result,{'error':'upstream_http','upstream_status':401})
    def test_health_uses_short_non_thinking_response(self):
        seen=[]
        def upstream(req,timeout):
            seen.append((json.loads(req.data),timeout))
            return io.BytesIO(json.dumps({'choices':[{'message':{'content':'休息并复测。'}}]}).encode())
        with patch.object(g.urllib.request,'urlopen',side_effect=upstream):
            code,body=self.call('/plan',b'{"query":"replay health","kind":"health"}')
            self.assertEqual(self.wait_result(body['job'])[0],200)
        self.assertEqual(seen[0][0]['thinking'],{'type':'disabled'})
        self.assertEqual(seen[0][0]['max_completion_tokens'],192)
        self.assertEqual(seen[0][1],10)
    def test_health_is_not_blocked_by_a_running_study_plan(self):
        entered=threading.Event(); release=threading.Event()
        def upstream(req,timeout):
            if timeout==40:
                entered.set(); release.wait(3)
            return io.BytesIO(json.dumps({'choices':[{'message':{'content':'short reply'}}]}).encode())
        with patch.object(g.urllib.request,'urlopen',side_effect=upstream):
            _,plan=self.call('/plan',b'{"query":"math"}')
            self.assertTrue(entered.wait(1))
            code,health=self.call('/plan',b'{"query":"replay health","kind":"health"}')
            self.assertEqual(code,202)
            self.assertEqual(self.wait_result(health['job'])[0],200)
            release.set();self.assertEqual(self.wait_result(plan['job'])[0],200)
    def test_validation_and_unknown_job(self):
        self.assertEqual(self.call('/plan',b'{}')[0],400)
        self.assertEqual(self.call('/plan',b'{}','text/plain')[0],415)
        self.assertEqual(self.call('/plan/not-a-job')[0],404)
if __name__=='__main__':unittest.main()
