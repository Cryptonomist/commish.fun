import { TEAMS } from "../src/lib/nfl";
const rgb = (h: string): [number,number,number] => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const apart=(a:string,b:string)=>{const[x1,y1,z1]=rgb(a);const[x2,y2,z2]=rgb(b);return Math.hypot(x1-x2,y1-y2,z1-z2)};
const MIN=120;
let worstTeam='', worstCount=Infinity;
const closest: {a:string;b:string;d:number}[] = [];
for(const t of TEAMS){
  const n = TEAMS.filter(o=>o.abbr!==t.abbr && apart(t.lead,o.lead)>=MIN).length;
  if(n<worstCount){worstCount=n;worstTeam=t.abbr;}
}
for(let i=0;i<TEAMS.length;i++) for(let j=i+1;j<TEAMS.length;j++){
  closest.push({a:TEAMS[i].abbr,b:TEAMS[j].abbr,d:Math.round(apart(TEAMS[i].lead,TEAMS[j].lead))});
}
closest.sort((x,y)=>x.d-y.d);
console.log("fewest eligible opponents:", worstTeam, worstCount, "of", TEAMS.length-1);
console.log("closest pairs in the league:", closest.slice(0,6).map(c=>`${c.a}/${c.b} ${c.d}`).join("  "));
console.log("pairs under MIN:", closest.filter(c=>c.d<MIN).length, "of", closest.length);
