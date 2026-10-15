const {test}=require('node:test'),assert=require('node:assert/strict');
const {Bastion}=require('../dist/bastion.js');
function client(){const c=new Bastion({siteKey:'public',endpoint:'http://localhost:3015/api/antibot',monitorOnInit:false});c.collectFingerprint=async()=>({canvas_hash:'unit-device'});c.collectEnvironment=async()=>({});return c;}
const decision={request_id:'unit-decision',risk_score:0,action:'allow',signals:[]};
test('receipt-only tracking negotiates proof without a preceding plaintext fingerprint call',async()=>{
 const c=client(),calls=[];c.transport.post=async(path,body)=>{calls.push([path,body]);if(path==='/browser/config')return {mode:'monitor',telemetry:true,interactions:false,encryptedExchange:false,events:['signup']};if(path==='/browser/start')return {id:'session',encrypted:false};if(path==='/browser/exchange')return {browser_receipt:'opaque-receipt'};if(path==='/collect')return decision;throw Error('Unexpected endpoint '+path)};
 try{await c.classify('',{event_type:'signup',account_id:'unit-account'});assert.deepEqual(calls.map(([p])=>p),['/browser/config','/browser/start','/browser/exchange','/collect']);assert.equal(calls[3][1].browser_receipt,'opaque-receipt');assert.equal(calls[3][1].fingerprint,undefined);assert.equal(calls[3][1].behavior,undefined);}finally{c.destroy()}
});
test('off policy never starts the additional exchange and preserves legacy telemetry',async()=>{
 const c=client(),paths=[];c.transport.post=async(path)=>{paths.push(path);if(path==='/browser/config')return {mode:'off',telemetry:false,interactions:false,encryptedExchange:false,events:['signup']};if(path==='/fingerprint')return {token:'fingerprint-token',device_id:'unit-device',expires_at:new Date(Date.now()+600000).toISOString()};throw Error('Unexpected endpoint '+path)};
 try{const request=await c.buildRequest({event_type:'signup',account_id:'unit-account'});assert.equal(request.token,'fingerprint-token');assert.ok(request.fingerprint);assert.equal(request.browser_receipt,undefined);assert.equal(request.behavior.ui_interactions,undefined);assert.deepEqual(paths,['/browser/config','/fingerprint']);}finally{c.destroy()}
});
test('generic UI counts are included only for an explicitly enabled interaction layer',async()=>{
 const c=client();let submitted;c.recordInteraction();c.transport.post=async(path,body)=>{if(path==='/browser/config')return {mode:'monitor',telemetry:false,interactions:true,encryptedExchange:false,events:['signup']};if(path==='/browser/start')return {id:'session',encrypted:false};if(path==='/browser/exchange'){submitted=body.payload;return {browser_receipt:'opaque-receipt'}}throw Error('Unexpected endpoint '+path)};
 try{await c.buildRequest({event_type:'signup',account_id:'unit-account'});assert.equal(submitted.behavior.ui_interactions,1);assert.equal(submitted.behavior.input_values,undefined);}finally{c.destroy()}
});
