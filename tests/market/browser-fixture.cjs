// Run inside the isolated F07 API container. Never loads .env or prints session credentials.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {DataSource}=require('typeorm');
const {ConfigService}=require('@nestjs/config');
const {JwtService}=require('@nestjs/jwt');
const configuration=require('/app/dist/config/configuration.js').default;
const {MarketProcessor}=require('/app/dist/domain/market/market.processor.js');
const {MarketService}=require('/app/dist/domain/market/market.service.js');
const {RedisService}=require('/app/dist/infrastructure/redis/redis.service.js');
(async()=>{
  const url=process.env.DATABASE_URL;
  if(!url||!['f03_test','f03_runtime_test','f07_test'].includes(new URL(url).pathname.slice(1)))throw new Error('Disposable test database required');
  const config=new ConfigService(configuration());
  const db=new DataSource({type:'postgres',url,connectTimeoutMS:5000});
  const redis=new RedisService(config);
  await db.initialize();await redis.onModuleInit();
  try{
    const observations=JSON.parse(fs.readFileSync('/tmp/f07-real-provider-observations.json','utf8'));
    if(!observations.length||observations.some(r=>r.source!=='AMIS'))throw new Error('Genuine captured provider observations required');
    const market=new MarketService(db,redis,config);
    const processor=new MarketProcessor(db,{fetchCurrentPrices:()=>Promise.resolve(observations)},market);
    const persisted=await processor.process({name:'sync_mandi_rates'});
    const current=await market.current({crop:'Wheat',province:'Punjab',limit:100});
    if(!current.records.length)throw new Error('No persisted wheat observations');
    const userId=crypto.randomUUID(),sessionId=crypto.randomUUID();
    await db.transaction(async manager=>{
      await manager.query("INSERT INTO users(id,email,role,status)VALUES($1,$2,'FARMER','active')",[userId,`f07-${userId}@example.invalid`]);
      await manager.query("INSERT INTO farmer_profiles(user_id,full_name,preferred_language,referral_code)VALUES($1,'F07 Verification Farmer','en',$2)",[userId,crypto.randomBytes(4).toString('hex').toUpperCase()]);
      await manager.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at)VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')",[sessionId,userId,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),crypto.randomUUID()]);
    });
    const token=new JwtService().sign({sub:userId,sid:sessionId,role:'FARMER',type:'access'},{secret:config.getOrThrow('jwtAccessSecret'),issuer:config.getOrThrow('jwtIssuer'),audience:config.getOrThrow('jwtAudience'),expiresIn:'1h'});
    fs.writeFileSync('/tmp/f07-browser-storage.json',JSON.stringify({cookies:[{name:'fg_access',value:token,domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax',expires:Math.floor(Date.now()/1000)+3600}],origins:[]}));
    fs.writeFileSync('/tmp/f07-browser-metadata.json',JSON.stringify({userId,sessionId,expectedRecordId:current.records[0].id,priceDate:current.records[0].priceDate,persisted}));
    console.log(JSON.stringify({status:'RUN_PASS',workflow:'captured genuine AMIS observations→actual worker→isolated PostgreSQL',received:persisted.received,inserted:persisted.inserted,records:current.records.length,credentialsLogged:false}));
  }finally{await redis.onModuleDestroy();await db.destroy();}
})().catch(error=>{console.error(JSON.stringify({status:'RUN_FAIL',code:error.code??error.name,table:error.table??null,column:error.column??null,message:'Isolated browser fixture could not be created; credentials suppressed.'}));process.exitCode=1;});
