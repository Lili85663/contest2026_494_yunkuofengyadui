// Official AIoT IDE emulator SDK. No credentials or application payloads are logged.
const fs = require('fs'), path = require('path'), os = require('os');
process.on('uncaughtException', e => { console.error(String(e)); process.exit(1) });
async function main() {
 const root=path.resolve(__dirname,'..'), extensions=path.join(os.homedir(),'.aiot-ide/extensions');
 const versions=fs.readdirSync(extensions).filter(n=>n.startsWith('vela.aiot-emulator-')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 if(!versions.length) throw new Error('请先安装 AIoT IDE 模拟器扩展');
 const sdk=require(path.join(extensions,versions[0],'dist/emulator/index.js'));
 const manager=new sdk.VvdManager();
 const r=await manager.startVvd({vvdName:'wrist-rhythm-contest',stdoutCallback:()=>{},stderrCallback:()=>{},customLogger:()=>{}});
 const app=JSON.parse(fs.readFileSync(path.join(root,'src/manifest.json'),'utf8'));
 if(process.argv[2]==='deploy') {
  const rpk=path.join(root,'dist',`${app.package}.debug.${app.versionName}.rpk`);
  if(!fs.existsSync(rpk)) throw new Error('请先执行 bash scripts/build-app.sh');
  await r.emulatorInstance.closeApp(app.package);
  await r.emulatorInstance.pushAndInstall(rpk,app.package);
  console.log('新版安装完成：'+app.versionName);
 }
 if(process.argv[2]!=='start') {
  await r.emulatorInstance.startApp(app.package);
  console.log('已发送打开命令；如果停在应用列表，请点“腕上节律教练”图标。');
 }
 console.log('官方赛事模拟器已就绪。健康指标为回放数据。冷启动后请保持本终端开启。');
 if(!r.coldBoot) process.exit(0);
}
main().catch(e=>{console.error(String(e));process.exit(1)});
