(() => {
'use strict';
const API='https://api.cloudflare.com/client/v4';
const $=id=>document.getElementById(id);
const state={token:'',accounts:[],account:null,workers:[],worker:null,versions:[],deployments:[],settings:null,versionDetail:null,source:'',logs:[],tail:null,tailSocket:null,diagnosis:[],report:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=s=>s?new Date(s).toLocaleString('fa-IR'):'نامشخص';
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500)}
function setStatus(id,message,kind=''){const el=$(id);el.textContent=message;el.className='status-text '+kind}
function apiPath(account,script,tail=''){return '/accounts/'+encodeURIComponent(account)+'/workers/scripts/'+encodeURIComponent(script)+(tail?'/'+tail:'')}
async function request(path,options={}){
  const headers={Authorization:'Bearer '+state.token,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
  const response=await fetch(API+path,{...options,headers});
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{data={raw}};
  if(!response.ok||data.success===false){const err=(data.errors||[]).map(x=>x.message).join('؛ ')||data.message||('HTTP '+response.status);throw new Error(err)}
  return data.result!==undefined?data.result:data;
}
async function requestText(path){
  const response=await fetch(API+path,{headers:{Authorization:'Bearer '+state.token}});
  const text=await response.text();
  if(!response.ok)throw new Error('HTTP '+response.status+' — '+text.slice(0,240));
  return text;
}
function resetWorker(){state.worker=null;state.versions=[];state.deployments=[];state.settings=null;state.versionDetail=null;state.source='';state.diagnosis=[];$('detailPanel').classList.add('hidden')}
function showPanel(id){$(id).classList.remove('hidden')}
function metric(label,value){return '<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>'}
function renderWorkers(){
  const q=$('workerSearch').value.trim().toLowerCase();
  const rows=state.workers.filter(w=>String(w.id||'').toLowerCase().includes(q));
  $('workersList').innerHTML=rows.length?rows.map(w=>'<button class="worker-item" data-worker="'+esc(w.id)+'"><span><b>'+esc(w.id)+'</b><small>Updated: '+esc(stamp(w.modified_on||w.created_on))+'</small></span><span class="worker-icon">W</span></button>').join(''):'<div class="empty-state">Workerی با این نام پیدا نشد.</div>';
  $('accountCount').textContent=state.workers.length+' Workers';
}
async function connect(){
  const token=$('apiToken').value.trim();
  if(!token){toast('ابتدا API Token را وارد کن.');return}
  state.token=token;
  $('connectBtn').disabled=true;setStatus('connectStatus','در حال بررسی مجوزها...');
  try{
    const verify=await request('/user/tokens/verify');
    if(verify.status&&verify.status!=='active')throw new Error('توکن فعال نیست.');
    const accounts=await request('/accounts?per_page=50');
    state.accounts=Array.isArray(accounts)?accounts:(accounts.result||[]);
    if(!state.accounts.length)throw new Error('هیچ Account قابل دسترسی پیدا نشد. مجوز Account Settings: Read را بررسی کن.');
    $('accountSelect').innerHTML=state.accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+' · '+esc(a.id)+'</option>').join('');
    showPanel('accountPanel');
    setStatus('connectStatus','اتصال موفق • '+state.accounts.length+' حساب','success');
    await loadWorkers();
    $('accountPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){state.token='';setStatus('connectStatus','اتصال ناموفق: '+e.message,'error');toast('اتصال برقرار نشد؛ مجوزهای Token را بررسی کن.')}
  finally{$('connectBtn').disabled=false}
}
async function loadWorkers(){
  resetWorker();state.account=$('accountSelect').value;
  $('workersList').innerHTML='<div class="empty-state">در حال دریافت فهرست Workerها...</div>';
  try{
    const result=await request('/accounts/'+encodeURIComponent(state.account)+'/workers/scripts');
    state.workers=Array.isArray(result)?result:(result.result||[]);
    renderWorkers();
  }catch(e){$('workersList').innerHTML='<div class="empty-state">خطا در دریافت Workerها: '+esc(e.message)+'</div>'}
}
async function selectWorker(name){
  stopTail();state.logs=[];$('logOutput').textContent='لاگی دریافت نشده است.';state.sourceError='';state.report=null;
  resetWorker();state.worker=name;
  $('selectedWorker').textContent=name;showPanel('detailPanel');
  $('summaryGrid').innerHTML=metric('Worker','در حال بررسی...')+metric('Versions','...')+metric('Deployments','...')+metric('Runtime','...');$('diagnosisList').innerHTML='<div class="empty-state">در حال دریافت اطلاعات Worker...</div>';
  $('detailPanel').scrollIntoView({behavior:'smooth',block:'start'});
  const a=encodeURIComponent(state.account),w=encodeURIComponent(name);
  const tasks=await Promise.allSettled([
    request(apiPath(state.account,name,'versions?per_page=20')),
    request(apiPath(state.account,name,'deployments?per_page=20')),
    request(apiPath(state.account,name,'settings')),
    request(apiPath(state.account,name,'versions'))
  ]);
  state.versions=tasks[0].status==='fulfilled'?(Array.isArray(tasks[0].value)?tasks[0].value:(tasks[0].value.result||[])):[];
  state.deployments=tasks[1].status==='fulfilled'?(Array.isArray(tasks[1].value)?tasks[1].value:(tasks[1].value.result||[])):[];
  state.settings=tasks[2].status==='fulfilled'?tasks[2].value:null;
  const extraVersions=tasks[3].status==='fulfilled'?(Array.isArray(tasks[3].value)?tasks[3].value:(tasks[3].value.result||[])):[];
  if(!state.versions.length)state.versions=extraVersions;
  const detail=state.versions[0];
  if(detail?.id){try{state.versionDetail=await request(apiPath(state.account,name,'versions/'+encodeURIComponent(detail.id)))}catch(e){}}
  try{state.source=await requestText(apiPath(state.account,name,'content/v2'))}catch(e){state.source='';state.sourceError=e.message}
  const current=state.deployments[0]?.versions?.[0]?.version_id||'نامشخص';
  $('summaryGrid').innerHTML=metric('Worker',name)+metric('Versions',state.versions.length)+metric('Deployments',state.deployments.length)+metric('Current Version',String(current).slice(0,12));
  fillVersions(current);
  setStatus('diagnosisStatus','اطلاعات اولیه دریافت شد');
  $('diagnosisList').innerHTML='<div class="empty-state">برای تحلیل Bindingها، کد و Runtime، «اجرای بررسی عمیق» را بزن.</div>';
}
function fillVersions(current){
  const options=state.versions.filter(v=>v.id&&v.id!==current);
  $('versionSelect').innerHTML=options.length?'<option value="">انتخاب نسخه قبلی...</option>'+options.map(v=>'<option value="'+esc(v.id)+'">#'+esc(v.number??'?')+' • '+esc(stamp(v.metadata?.created_on))+' • '+esc(v.id.slice(0,12))+'</option>').join(''):'<option value="">نسخه قبلی در دسترس نیست</option>';
  $('rollbackBtn').disabled=!options.length;
}
function addFinding(level,title,detail){state.diagnosis.push({level,title,detail})}
function runDiagnosis(){
  state.diagnosis=[];
  const source=state.source||'';
  const bindings=state.versionDetail?.resources?.bindings||state.settings?.bindings||[];
  const bindingNames=new Set(bindings.map(b=>b.name).filter(Boolean));
  const active=state.deployments[0]?.versions||[];
  if(source){
    addFinding('ok','سورس Worker دریافت شد',source.length.toLocaleString('en-US')+' کاراکتر کد در حافظه مرورگر بررسی شد؛ روی سرور ZERYNX آپلود نشده است.');
    if(/export\s+default\s+/.test(source)||/addEventListener\s*\(\s*["']fetch["']/.test(source))addFinding('ok','ساختار Entry Point شناسایی شد','الگوی Module Worker یا Service Worker در سورس دیده شد.');
    else addFinding('warn','Entry Point قابل تشخیص نیست','export default یا fetch event listener در متن سورس پیدا نشد. اگر کد build شده/فشرده است، این نتیجه قطعی نیست.');
    if(/\brequire\s*\(/.test(source))addFinding('warn','استفاده از require()','در Workerهای Module، require ممکن است به تنظیمات Node compatibility نیاز داشته باشد.');
    if(/\bprocess\.env\b/.test(source))addFinding('warn','ارجاع process.env','مطمئن شو Node.js compatibility و متغیرهای لازم در تنظیمات نسخه فعال هستند.');
    if(/\bBuffer\b/.test(source)&&!String(state.versionDetail?.resources?.script_runtime?.compatibility_flags||'').includes('nodejs_compat'))addFinding('warn','استفاده از Buffer','کد از Buffer استفاده می‌کند؛ وضعیت nodejs_compat را در Runtime بررسی کن.');
    const refs=[...source.matchAll(/\b(?:env|ENV)\.([A-Z][A-Z0-9_]*)/g)].map(m=>m[1]);
    const unique=[...new Set(refs)];
    const missing=unique.filter(n=>!bindingNames.has(n));
    if(missing.length)addFinding('warn','Bindingهای ارجاع‌شده در Metadata پیدا نشدند',missing.join(', ')+' — ممکن است متغیر محیطی، Secret یا Binding در خروجی API پنهان باشد؛ این مورد را در Dashboard تأیید کن.');
    else if(unique.length)addFinding('ok','ارجاع‌های env با Bindingهای قابل مشاهده تطبیق دارند',unique.join(', '));
    if(/from\s*["']cloudflare:sockets["']/.test(source))addFinding('ok','Cloudflare Sockets API شناسایی شد','این Worker از cloudflare:sockets استفاده می‌کند؛ سازگاری runtime و نوع اتصال را در لاگ‌ها بررسی کن.');
    if(/\.map\s*\(/.test(source)||/\.forEach\s*\(/.test(source))addFinding('warn','عملیات آرایه‌ای در سورس وجود دارد','اگر خطاهایی مثل Cannot read properties of undefined دریافت می‌کنی، مقدار ورودی پیش از map/forEach را بررسی کن. وجود این الگو به‌تنهایی باگ نیست.');
  }else addFinding('warn','دریافت سورس ناموفق بود',state.sourceError||'Cloudflare API محتوای Worker را برنگرداند؛ مجوز Workers Scripts: Edit را بررسی کن.');
  if(!state.versionDetail)addFinding('warn','جزئیات نسخه فعال در دسترس نیست','API جزئیات نسخه را نداد؛ بررسی Bindingها ناقص خواهد بود.');
  if(!bindings.length)addFinding('warn','Binding قابل مشاهده‌ای پیدا نشد','ممکن است Worker هیچ Binding نداشته باشد یا API مجوز/داده کافی برنگردانده باشد.');
  else addFinding('ok','Bindingهای نسخه بررسی شدند',bindings.map(b=>b.name+' ('+b.type+')').join('، '));
  if(active.length>1)addFinding('warn','Deployment چندنسخه‌ای است','در حال حاضر بیش از یک نسخه در ترافیک فعال است؛ پیش از Rollback درصدهای ترافیک را بررسی کن.');
  else if(active.length===1)addFinding('ok','یک نسخه فعال شناسایی شد','نسخه فعال: '+active[0].version_id);
  else addFinding('warn','Deployment فعال شناسایی نشد','فهرست Deploymentها خالی یا غیرقابل‌دسترسی است.');
  if(state.versions.length>1)addFinding('ok','نسخه قبلی برای بازیابی موجود است',(state.versions.length-1)+' نسخه دیگر در تاریخچه دیده شد.');
  else addFinding('bad','نسخه قبلی در دسترس نیست','Rollback خودکار ممکن نیست؛ ابتدا سورس و گزارش را ذخیره کن و خطای واقعی را بررسی کن.');
  addFinding('warn','1101 از روی سورس به‌تنهایی قطعی تشخیص داده نمی‌شود','Runtime Logs را در همان زمان وقوع خطا بگیر. این ابزار تغییر حدسی در کد Worker انجام نمی‌دهد.');
  renderDiagnosis();
  state.report={created_at:new Date().toISOString(),account:state.account,worker:state.worker,versions:state.versions,deployments:state.deployments,bindings:bindings,findings:state.diagnosis,logs:state.logs};
}
function renderDiagnosis(){
  $('diagnosisList').innerHTML=state.diagnosis.map(f=>'<div class="finding '+f.level+'"><span class="finding-mark">'+(f.level==='ok'?'✓':f.level==='bad'?'!':'?')+'</span><div><b>'+esc(f.title)+'</b><p>'+esc(f.detail)+'</p></div></div>').join('');
  setStatus('diagnosisStatus','بررسی کامل شد • '+state.diagnosis.length+' مورد');
}
function addLog(value){
  const text=typeof value==='string'?value:JSON.stringify(value);
  state.logs.push({time:new Date().toISOString(),data:value});
  if(state.logs.length>120)state.logs.shift();
  $('logOutput').textContent=state.logs.map(x=>'['+new Date(x.time).toLocaleTimeString() +'] '+(typeof x.data==='string'?x.data:JSON.stringify(x.data))).join('\n');
  $('logOutput').scrollTop=$('logOutput').scrollHeight;
  if(/exception|uncaught|error|1101|crash/i.test(text))setStatus('tailStatus','خطا در لاگ دیده شد','error');
}
async function startTail(){
  if(state.tailSocket){toast('دریافت لاگ در حال اجراست.');return}
  $('tailBtn').disabled=true;setStatus('tailStatus','در حال ساخت Log Tail...');
  try{
    const result=await request(apiPath(state.account,state.worker,'tails'),{method:'POST',body:'{}'});
    state.tail=result;
    if(!result.url)throw new Error('Cloudflare آدرس WebSocket لاگ را برنگرداند.');
    const ws=new WebSocket(result.url);state.tailSocket=ws;
    ws.onopen=()=>{setStatus('tailStatus','در حال دریافت زنده • درخواست آزمایشی بفرست','success');$('stopTailBtn').disabled=false;addLog('Tail connected. اکنون یک درخواست به Worker ارسال کن.')};
    ws.onmessage=e=>{try{addLog(JSON.parse(e.data))}catch{addLog(e.data)}};
    ws.onerror=()=>{setStatus('tailStatus','خطا در WebSocket لاگ','error')};
    ws.onclose=()=>{state.tailSocket=null;$('tailBtn').disabled=false;$('stopTailBtn').disabled=true;if($('tailStatus').textContent.includes('در حال'))setStatus('tailStatus','اتصال لاگ بسته شد')};
  }catch(e){state.tailSocket=null;$('tailBtn').disabled=false;setStatus('tailStatus','دریافت لاگ ناموفق: '+e.message,'error');toast('Tail شروع نشد؛ مجوز Workers Tail را بررسی کن.')}
}
function stopTail(){if(state.tailSocket){state.tailSocket.close();state.tailSocket=null}state.tail=null;$('tailBtn').disabled=false;$('stopTailBtn').disabled=true;setStatus('tailStatus','دریافت متوقف شد')}
function download(name,content,type='application/json'){
  const blob=new Blob([content],{type:type+';charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
function backup(){if(!state.source){toast('سورس Worker برای پشتیبان‌گیری دریافت نشده است.');return}download('zerynx-worker-'+state.worker+'-source-backup.js',state.source,'text/javascript');toast('نسخه پشتیبان کد آماده شد.')}
async function rollback(){
  const versionId=$('versionSelect').value;
  if(!versionId){toast('ابتدا یک نسخه قبلی انتخاب کن.');return}
  const version=state.versions.find(v=>v.id===versionId);
  const label='نسخه '+(version?.number??'?')+' ('+versionId.slice(0,12)+')';
  if(!confirm('تأیید نهایی: ترافیک Worker «'+state.worker+'» به‌طور کامل به '+label+' منتقل شود؟\n\nاین عملیات یک Deployment جدید ایجاد می‌کند.'))return;
  $('rollbackBtn').disabled=true;setStatus('rollbackStatus','در حال ایجاد Deployment بازیابی...');
  try{
    const result=await request(apiPath(state.account,state.worker,'deployments'),{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:versionId,percentage:100}],annotations:{'workers/message':'ZERYNX Recovery rollback to version '+(version?.number??versionId),'workers/triggered_by':'api'}})});
    setStatus('rollbackStatus','درخواست بازیابی ثبت شد • Deployment: '+(result.id||'created'),'success');toast('Deployment بازیابی ایجاد شد. وضعیت Worker را دوباره بررسی کن.');
    await selectWorker(state.worker);
  }catch(e){setStatus('rollbackStatus','بازیابی ناموفق: '+e.message,'error');toast('Rollback انجام نشد؛ جزئیات خطا را بررسی کن.')}
  finally{$('rollbackBtn').disabled=!$('versionSelect').value}
}
function exportReport(){
  const report=state.report||{created_at:new Date().toISOString(),account:state.account,worker:state.worker};
  report.logs=state.logs;report.findings=state.diagnosis;
  download('zerynx-recovery-report-'+(state.worker||'worker')+'.json',JSON.stringify(report,null,2));
}
$('connectBtn').addEventListener('click',connect);
$('toggleToken').addEventListener('click',()=>{$('apiToken').type=$('apiToken').type==='password'?'text':'password'});
$('clearBtn').addEventListener('click',()=>{state.token='';$('apiToken').value='';state.accounts=[];state.workers=[];stopTail();$('accountPanel').classList.add('hidden');resetWorker();setStatus('connectStatus','توکن از حافظه پاک شد');toast('توکن از حافظه صفحه پاک شد.')});
$('accountSelect').addEventListener('change',loadWorkers);
$('workerSearch').addEventListener('input',renderWorkers);
$('workersList').addEventListener('click',e=>{const b=e.target.closest('[data-worker]');if(b)selectWorker(b.dataset.worker)});
$('diagnoseBtn').addEventListener('click',runDiagnosis);
$('tailBtn').addEventListener('click',startTail);
$('stopTailBtn').addEventListener('click',stopTail);
$('backupBtn').addEventListener('click',backup);
$('rollbackBtn').addEventListener('click',rollback);
$('versionSelect').addEventListener('change',()=>{$('rollbackBtn').disabled=!$('versionSelect').value});
$('reportBtn').addEventListener('click',exportReport);
window.addEventListener('beforeunload',()=>{if(state.tailSocket)state.tailSocket.close();state.token=''});
})();