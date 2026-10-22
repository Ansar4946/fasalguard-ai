// Remove only this run's synthetic identity; retain real public observations for DB proof.
const fs=require('node:fs');
const {DataSource}=require('typeorm');
(async()=>{
  const url=process.env.DATABASE_URL;
  if(!url||!['f03_test','f03_runtime_test','f07_test'].includes(new URL(url).pathname.slice(1)))throw new Error('Disposable test database required');
  const meta=JSON.parse(fs.readFileSync('/tmp/f07-browser-metadata.json','utf8'));
  const db=new DataSource({type:'postgres',url,connectTimeoutMS:5000});await db.initialize();
  try{
    const removed=await db.transaction(async manager=>{
      await manager.query("SET LOCAL statement_timeout='8s'");
      return manager.query("DELETE FROM users WHERE id=$1 AND email=$2 AND role='FARMER' RETURNING id",[meta.userId,`f07-${meta.userId}@example.invalid`]);
    });
    const rows=await db.query('SELECT average_price,quantity,source,price_date::text FROM mandi_prices WHERE id=$1',[meta.expectedRecordId]);
    if(rows.length!==1||rows[0].source!=='AMIS'||rows[0].quantity!==100)throw new Error('Persisted quote proof failed');
    const remaining=await db.query('SELECT id FROM users WHERE id=$1',[meta.userId]);
    if(remaining.length)throw new Error('Synthetic session owner was not removed');
    const removedCount=Array.isArray(removed[0])&&typeof removed[1]==='number'?removed[1]:removed.length;
    console.log(JSON.stringify({status:'RUN_PASS',syntheticUsersRemoved:removedCount,syntheticSessionOwnerAbsent:true,persistedQuoteStillPresent:true,source:rows[0].source,sourceQuantityKg:rows[0].quantity,priceDate:rows[0].price_date,credentialsLogged:false}));
  }finally{await db.destroy();}
})().catch(()=>{console.error('RUN_FAIL: guarded synthetic-session cleanup or database proof failed.');process.exitCode=1;});
