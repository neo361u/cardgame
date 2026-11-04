'use strict';
const express=require('express'),http=require('http'),crypto=require('crypto'),path=require('path');
const {Server}=require('socket.io');
const app=express();app.disable('x-powered-by');app.use(express.static(path.join(__dirname,'public')));
const server=http.createServer(app),io=new Server(server);const rooms=new Map();
const CARDS=[
 {id:'v',name:'V — Streetkid',cost:5,ram:2,power:6,image:'/cards/v.png'},
 {id:'royce',name:'Royce — Psycho on the Edge',cost:6,ram:2,power:6,image:'/cards/royce.png'},
 {id:'adam',name:'Adam Smasher — Ender of Legends',cost:9,ram:2,power:9,image:'/cards/adam.png'},
 {id:'dexter',name:'Dexter DeShawn — Off the Grid',cost:0,ram:2,power:0,image:'/cards/dexter.png'},
 {id:'johnny',name:'Johnny Silverhand — Rocking Renegade',cost:0,ram:2,power:0,image:'/cards/johnny.png'},
 {id:'japantown',name:'Japantown Ronin',cost:2,ram:2,power:0,image:'/cards/japantown.png'},
 {id:'ruthless',name:'Ruthless Lowlife',cost:2,ram:1,power:4,image:'/cards/ruthless.png'},
 {id:'llorona',name:'La Llorona — Ghost of the Past',cost:3,ram:1,power:3,image:'/cards/llorona.png'}
];
// Destek kartları ana kartlardan ayrı tanımlanır. Şu an desteğe ekli kart yok.
// Örnek kayıt: {id:'shield', name:'Kalkan',ram:2,powerBonus:0,image:'/cards/shield.png',effect:'protection'}
const SUPPORT_CARDS=[];
const card=id=>CARDS.find(c=>c.id===id),support=id=>SUPPORT_CARDS.find(c=>c.id===id);
const roll=n=>Array.from({length:n},()=>crypto.randomInt(1,7)),sum=a=>a.reduce((x,y)=>x+y,0);
const randCode=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const hash=(pass,salt)=>crypto.scryptSync(pass,salt,32).toString('hex');
const result=(cb,ok,error,extra={})=>{if(typeof cb==='function')cb({ok,...(!ok?{error}:{}),...extra});};
const cleanName=n=>String(n||'').trim().slice(0,24);
function log(r,message){r.log.unshift({id:crypto.randomUUID(),time:Date.now(),message});r.log=r.log.slice(0,60);}
function member(socket){const r=rooms.get(socket.data.room),p=r?.players.get(socket.data.playerId);return p?.socketId===socket.id?{r,p}:null;}
function view(r,p){return {code:r.code,hostId:r.hostId,phase:r.phase,me:p.id,round:r.round,draftTurn:r.phase==='draft'?r.order[r.draftIndex%2]:null,draftPool:r.phase==='draft'?r.deck.map(card):[],
 players:r.order.map(id=>{const q=r.players.get(id);return {id:q.id,name:q.name,online:!!q.socketId,selected:q.hand.length,budget:q.budget,budgetMax:q.budgetMax,rolled:q.rolled,played:!!r.pending[q.id],wins:q.wins,handCount:q.hand.length,score:q.wins};}),
 hand:p.hand.map(card),supports:p.supports.map(support),pending:r.pending[p.id]||null,roundHistory:r.history,roll:p.lastRoll,log:r.log,
 supportsAvailable:SUPPORT_CARDS.length,selectionCount:p.hand.length};}
function broadcast(r){for(const p of r.players.values())if(p.socketId)io.to(p.socketId).emit('state',view(r,p));}
function attach(socket,r,p){if(socket.data.room)socket.leave(socket.data.room);if(p.socketId&&p.socketId!==socket.id){io.to(p.socketId).emit('session-replaced');io.sockets.sockets.get(p.socketId)?.disconnect(true);}p.socketId=socket.id;socket.data.room=r.code;socket.data.playerId=p.id;socket.join(r.code);broadcast(r);}
function newPlayer(name){return {id:crypto.randomUUID(),name,token:crypto.randomBytes(24).toString('hex'),socketId:null,hand:[],supports:[],rolled:false,budgetMax:null,budget:null,wins:0,lastRoll:null};}
function finishRound(r){
 const entries=r.order.map(id=>r.pending[id]);const [a,b]=entries;const winner=a.totalPower===b.totalPower?null:(a.totalPower>b.totalPower?a.playerId:b.playerId);
 if(winner)r.players.get(winner).wins++;
 const entry={round:r.round,plays:entries,winner,tie:!winner};r.history.push(entry);
 log(r,`EL ${r.round}: ${entries[0].playerName} ${a.totalPower} — ${b.totalPower} ${entries[1].playerName}. ${winner?r.players.get(winner).name+' kazandı.':'Berabere.'}`);
 r.pending={};if(r.round===3){r.phase='finished';const wins=r.order.map(id=>r.players.get(id).wins);log(r,wins[0]===wins[1]?'Maç berabere bitti.':`MAÇ GALİBİ: ${r.players.get(r.order[wins[0]>wins[1]?0:1]).name}`);}else r.round++;
}
io.on('connection',socket=>{
 socket.on('create-room',(b={},cb)=>{try{const name=cleanName(b.name),password=String(b.password||'');if(!name||password.length<4||password.length>64)return result(cb,false,'İsim ve en az 4 karakterli şifre gerekli.');let code;do{code=randCode()}while(rooms.has(code));const salt=crypto.randomBytes(16).toString('hex'),p=newPlayer(name);const r={code,salt,passwordHash:hash(password,salt),hostId:p.id,players:new Map([[p.id,p]]),order:[p.id],phase:'lobby',round:0,deck:[],draftIndex:0,pending:{},history:[],log:[],created:Date.now()};rooms.set(code,r);log(r,`${name} odayı oluşturdu.`);attach(socket,r,p);result(cb,true,null,{code,token:p.token,playerId:p.id});}catch{result(cb,false,'Oda oluşturulamadı.');}});
 socket.on('join-room',(b={},cb)=>{try{const code=String(b.code||'').trim().toUpperCase(),r=rooms.get(code),name=cleanName(b.name),password=String(b.password||'');if(!r||!name)return result(cb,false,'Oda veya oyuncu adı bulunamadı.');const expected=Buffer.from(r.passwordHash,'hex'),actual=Buffer.from(hash(password,r.salt),'hex');if(!crypto.timingSafeEqual(expected,actual))return result(cb,false,'Şifre yanlış.');if(r.phase!=='lobby')return result(cb,false,'Maç başladı; yeni oyuncu alınmıyor.');if(r.players.size>=2)return result(cb,false,'Bu oyun iki kişilik; oda dolu.');if([...r.players.values()].some(p=>p.name.toLocaleLowerCase('tr')===name.toLocaleLowerCase('tr')))return result(cb,false,'Bu isim zaten kullanılıyor.');const p=newPlayer(name);r.players.set(p.id,p);r.order.push(p.id);log(r,`${name} katıldı.`);attach(socket,r,p);result(cb,true,null,{code,token:p.token,playerId:p.id});}catch{result(cb,false,'Odaya girilemedi.');}});
 socket.on('resume-room',(b={},cb)=>{const r=rooms.get(String(b.code||'').toUpperCase()),p=r?.players.get(b.playerId);if(!p||typeof b.token!=='string'||p.token!==b.token)return result(cb,false,'Oturum bulunamadı.');attach(socket,r,p);result(cb,true,null,{code:r.code,token:p.token,playerId:p.id});});
 socket.on('start-game',(_,cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m;if(p.id!==r.hostId||r.phase!=='lobby'||r.players.size!==2)return result(cb,false,'Sadece oda sahibi, iki oyuncu hazırken başlatabilir.');r.phase='draft';r.deck=CARDS.map(c=>c.id);r.draftIndex=0;r.history=[];r.pending={};r.round=0;for(const x of r.players.values()){x.hand=[];x.supports=[];x.rolled=false;x.budgetMax=null;x.budget=null;x.wins=0;x.lastRoll=null;}log(r,'Kart seçimi başladı. Sırayla 3 kart seçin (6 kart toplam).');broadcast(r);result(cb,true);});
 socket.on('pick-card',(b={},cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m;if(r.phase!=='draft')return result(cb,false,'Seçim aşaması değil.');if(r.order[r.draftIndex%2]!==p.id)return result(cb,false,'Seçim sırası rakibinde.');if(!r.deck.includes(b.cardId))return result(cb,false,'Kart artık destede yok.');p.hand.push(b.cardId);r.deck=r.deck.filter(id=>id!==b.cardId);r.draftIndex++;log(r,`${p.name} ${p.hand.length}. kartını seçti.`);if(r.draftIndex===6){r.phase='budget';log(r,'Seçim bitti. İki oyuncu da 3D6 bütçe zarı atmalı.');}broadcast(r);result(cb,true);});
 socket.on('roll-budget',(_,cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m;if(r.phase!=='budget'||p.rolled)return result(cb,false,'Bütçe zarını şu anda atamazsın.');const dice=roll(3);p.rolled=true;p.budgetMax=sum(dice);p.budget=p.budgetMax;p.lastRoll={kind:'budget',dice,total:p.budget};log(r,`${p.name}: 3D6 (${dice.join('+')}) = ${p.budget} toplam bütçe.`);if(r.order.every(id=>r.players.get(id).rolled)){r.phase='playing';r.round=1;log(r,'1. el başladı. Kartlar gizli oynanır, iki taraf bitirince açılır.');}broadcast(r);result(cb,true);});
 socket.on('play-card',(b={},cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m;if(r.phase!=='playing')return result(cb,false,'Oyun aşaması değil.');if(r.pending[p.id])return result(cb,false,'Bu elde zaten kart oynadın.');const c=card(b.cardId);if(!c||!p.hand.includes(c.id))return result(cb,false,'Bu kart elinde yok.');if(c.cost>p.budget)return result(cb,false,`Bütçe yetersiz. ${c.cost} gerekir, ${p.budget} kaldı.`);
 const dice=roll(2),attack=dice[0],ramRoll=dice[1],ramPassed=ramRoll>=c.ram,bonus=ramPassed?attack:0,extraRam=Math.max(0,ramRoll-c.ram);
 p.budget-=c.cost;p.hand=p.hand.filter(id=>id!==c.id);
 const entry={playerId:p.id,playerName:p.name,card:c,basePower:c.power,attackRoll:attack,ramRoll,ramPassed,bonus,extraRam,supportIds:[],supportPower:0,totalPower:c.power+bonus,costPaid:c.cost};r.pending[p.id]=entry;
 p.lastRoll={kind:'attack',dice,ramPassed,bonus,total:entry.totalPower,extraRam};log(r,`${p.name}, ${r.round}. el kartını ve zarlarını gizli oynadı.`);
 // Destek kartları eklenirse, 'finish-turn' üzerinden bekleme mantığına geçer.
 if(SUPPORT_CARDS.length===0&&r.order.every(id=>r.pending[id]))finishRound(r);
 broadcast(r);result(cb,true);
 });
 socket.on('attach-support',(b={},cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m,e=r.pending[p.id],s=support(b.cardId);if(r.phase!=='playing'||!e||!s||!p.supports.includes(s.id))return result(cb,false,'Bu destek kartını oynayamazsın.');const spent=e.supportIds.reduce((v,id)=>v+support(id).ram,0);if(spent+s.ram>e.extraRam)return result(cb,false,'Fazladan RAM yetersiz.');e.supportIds.push(s.id);e.supportPower+=s.powerBonus||0;e.totalPower+=s.powerBonus||0;p.supports=p.supports.filter(id=>id!==s.id);log(r,`${p.name} bir destek kartı bağladı.`);broadcast(r);result(cb,true);});
 socket.on('finish-turn',(_,cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m,e=r.pending[p.id];if(!e||r.phase!=='playing'||e.ready)return result(cb,false,'Tamamlanacak elin yok.');e.ready=true;if(r.order.every(id=>r.pending[id]?.ready))finishRound(r);broadcast(r);result(cb,true);});
 socket.on('reset-game',(_,cb)=>{const m=member(socket);if(!m)return result(cb,false,'Odaya gir.');const {r,p}=m;if(p.id!==r.hostId)return result(cb,false,'Sadece oda sahibi sıfırlayabilir.');r.phase='lobby';r.deck=[];r.round=0;r.pending={};r.history=[];for(const q of r.players.values()){q.hand=[];q.supports=[];q.budget=null;q.budgetMax=null;q.rolled=false;q.wins=0;q.lastRoll=null;}log(r,'Oyun sıfırlandı.');broadcast(r);result(cb,true);});
 socket.on('disconnect',()=>{const m=member(socket);if(!m)return;m.p.socketId=null;broadcast(m.r);});
});
setInterval(()=>{for(const [code,r] of rooms)if(Date.now()-r.created>24*3600e3&&![...r.players.values()].some(p=>p.socketId))rooms.delete(code);},3600e3).unref();
server.listen(process.env.PORT||3000,()=>console.log('Neon Card Arena hazır.'));
