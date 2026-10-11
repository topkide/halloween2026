export const EVENT={maxTickets:30,distancePerTicket:300,initialTickets:5};
export const GOODS=[{id:'badge',name:'호박 사냥꾼 배지',copy:'호박 사냥꾼 배지를 수집해요.',price:40,icon:'badge'},{id:'friend',name:'작은 유령 친구',copy:'저택 앞에 유령 친구가 찾아와요.',price:80,icon:'ghost'},{id:'lantern',name:'달빛 호박 랜턴',copy:'메인화면을 밝히는 호박 장식이에요.',price:120,icon:'pumpkin'}];
const int=(v,fallback=0)=>Number.isSafeInteger(v)&&v>=0?v:fallback;
export function eventState(value){return {tickets:Math.min(EVENT.maxTickets,int(value?.tickets,EVENT.initialTickets)),distance:Math.min(299,int(value?.distance,20)),owned:Array.isArray(value?.owned)?[...new Set(value.owned.filter(id=>GOODS.some(g=>g.id===id)))]:[]};}
export function addTickets(value,count){const s=eventState(value);return {...s,tickets:Math.min(EVENT.maxTickets,s.tickets+int(count))};}
export function addDistance(value,meters){const s=eventState(value);if(s.tickets===EVENT.maxTickets)return s;const d=s.distance+int(meters);return {...s,tickets:Math.min(EVENT.maxTickets,s.tickets+Math.floor(d/EVENT.distancePerTicket)),distance:d%EVENT.distancePerTicket};}
export function useTicket(value){const s=eventState(value);return s.tickets>0?{ok:true,state:{...s,tickets:s.tickets-1}}:{ok:false,state:s};}
export function exchange(value,economy,id){const s=eventState(value),item=GOODS.find(g=>g.id===id);if(!item||s.owned.includes(id)||economy.eventCoins<item.price)return {ok:false,state:s,economy};return {ok:true,state:{...s,owned:[...s.owned,id]},economy:{...economy,eventCoins:economy.eventCoins-item.price}};}
