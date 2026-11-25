(() => {
  'use strict';
  const entries={
    all:[
      ['ledger','Cabinet ledger','Linen covers protect a row of thumb-cut index tabs.'],
      ['lens','Reading glass','A brass hand lens for the smallest entries.'],
      ['seal','Catalogue seal','The copper stamp leaves a little shelf mark in wax.']
    ],
    collections:[
      ['folio','Specimen folio','Cotton tape holds the green collecting folio closed.'],
      ['tags','Brass tags','A set of numbered tabs once tied to the shelf rails.'],
      ['spool','Binding twine','A length of flax for tying a collection together.']
    ],
    unfiled:[
      ['ticket','Tram ticket','One corner is punched for the return journey.'],
      ['button','Enamel button','A loose blue button, threaded with a scrap of cord.'],
      ['map','Pocket map','A footpath crosses the river at a tiny wooden bridge.']
    ]
  };
  function makeSprite(id) {
    const canvas=document.createElement('canvas');canvas.width=72;canvas.height=51;
    const c=canvas.getContext('2d');
    const dark='#39291f', wood='#926643', amber='#bc8e51', brass='#c2a969', gold='#edd298',
      paper='#ddc79f', edge='#ac9470', cream='#f1dcb2', green='#657655', pale='#97a483',
      teal='#72958d', deep='#415c55', red='#9f6551', wine='#69423b', steel='#81918c';
    const dot=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
    function line(x,y,a,b,color,n=1) {
      const length=Math.max(1,Math.ceil(Math.max(Math.abs(a-x),Math.abs(b-y))));
      for(let i=0;i<=length;i++) dot(x+(a-x)*i/length,y+(b-y)*i/length,n,n,color);
    }
    function poly(pts,color) {
      for(let y=Math.floor(Math.min(...pts.map(v=>v[1])));y<Math.max(...pts.map(v=>v[1]));y++) {
        const cuts=[];
        for(let i=0,j=pts.length-1;i<pts.length;j=i++) {
          const [x1,y1]=pts[i],[x2,y2]=pts[j];
          if((y1>y+.5)!==(y2>y+.5)) cuts.push(x1+(y+.5-y1)*(x2-x1)/(y2-y1));
        }
        cuts.sort((a,b)=>a-b);
        for(let k=0;k+1<cuts.length;k+=2){const x=Math.ceil(cuts[k]-.5);dot(x,y,Math.ceil(cuts[k+1]-.5)-x,1,color);}
      }
    }
    function oval(x,y,rx,ry,color) {
      for(let j=Math.ceil(-ry);j<=ry;j++){
        const extent=Math.round(rx*Math.sqrt(Math.max(0,1-(j/ry)**2)));
        dot(x-extent,y+j,extent*2+1,1,color);
      }
    }
    if(id==='ledger'||id==='folio') {
      const folio=id==='folio',board=folio?green:wine;
      poly([[4,13],[47,3],[68,30],[66,37],[22,48],[5,21]],dark);
      poly([[6,14],[46,5],[65,31],[22,43]],cream);
      poly([[22,42],[65,31],[65,36],[23,46]],edge);line(23,44,62,34,paper);
      for(let i=0;i<3;i++) poly([[47+i*5,13+i*5],[52+i*5,12+i*5],[55+i*5,17+i*5],[50+i*5,18+i*5]],i%2?red:brass);
      poly([[4,12],[46,2],[65,28],[22,40]],board);
      poly([[5,13],[11,12],[29,38],[22,40]],folio?deep:dark);
      line(13,11,31,36,folio?pale:red);
      if(folio) {
        poly([[21,8],[29,6],[47,33],[39,35]],brass);
        poly([[22,9],[26,8],[43,33],[40,34]],gold);
        line(37,23,48,18,cream,2);line(38,23,49,24,brass,2);
      } else {
        poly([[22,14],[42,9],[50,20],[30,25]],edge);
        poly([[24,15],[41,11],[47,19],[30,23]],paper);
        line(30,17,41,14,wood);line(31,19,38,17,wood);
      }
    } else if(id==='lens') {
      line(44,27,63,42,dark,7);line(44,26,63,41,wood,5);line(47,28,63,40,amber,2);
      oval(30,20,21,17,dark);oval(30,18,21,16,brass);oval(30,18,18,13,deep);
      oval(30,17,16,11,teal);line(17,18,24,10,cream,2);line(19,20,22,17,pale);
      line(31,28,41,24,pale);line(42,29,49,34,gold,3);
    } else if(id==='seal') {
      oval(23,33,16,9,wine);oval(21,32,15,7,red);oval(21,31,10,5,wine);
      line(16,33,16,29,red);line(16,32,25,30,red);line(25,30,25,27,red);
      poly([[33,32],[46,25],[59,32],[59,39],[44,47],[32,40]],dark);
      poly([[33,31],[47,24],[60,31],[45,40]],brass);poly([[34,35],[45,40],[59,33],[58,38],[44,44],[34,39]],amber);
      poly([[39,29],[43,21],[39,14],[40,9],[44,5],[51,4],[56,7],[57,13],[52,19],[50,29],[46,32]],wood);
      oval(48,10,8,5,amber);line(44,8,48,7,gold);
    } else if(id==='tags') {
      for(const [x,y,color] of [[7,24,wood],[22,20,amber],[34,14,brass]]) {
        poly([[x,y],[x+10,y-9],[x+17,y-9],[x+28,y+7],[x+27,y+11],[x+11,y+19]],dark);
        poly([[x,y-1],[x+10,y-10],[x+17,y-10],[x+27,y+6],[x+25,y+10],[x+11,y+17]],color);
        oval(x+11,y-4,2,2,dark);line(x+12,y+5,x+17,y+1,wood);
      }
      line(17,19,25,5,paper,2);line(25,5,41,4,paper);line(41,4,45,10,paper);
    } else if(id==='spool') {
      poly([[15,17],[44,4],[58,30],[29,45]],wood);
      oval(23,18,13,10,dark);oval(22,15,13,9,amber);oval(22,15,4,3,dark);
      poly([[17,18],[34,9],[52,32],[33,41]],brass);
      for(let i=0;i<9;i++) line(19+i*1.7,20+i*2.1,34+i*1.8,12+i*2.2,i%2?gold:wood);
      oval(43,37,14,10,wood);oval(43,34,14,9,amber);oval(43,34,5,3,dark);
      line(52,33,61,28,paper,2);line(61,28,67,31,brass,2);line(67,31,65,42,brass);
    } else if(id==='ticket') {
      const ticket=[[4,21],[50,5],[54,9],[54,12],[58,12],[66,21],[63,23],[65,27],[20,44],[15,41],[15,39],[11,38]];
      poly(ticket,dark);poly(ticket.map(([x,y])=>[x,y-2]),red);
      poly([[9,20],[46,7],[60,23],[21,38]],paper);line(19,22,43,13,wood,2);line(23,27,47,18,wood);
      for(let i=0;i<5;i++) line(26+i*4,30-i*1.4,28+i*4,32-i*1.4,wine);
      oval(53,14,2,2,dark);
    } else if(id==='button') {
      oval(33,26,23,18,dark);oval(33,23,23,17,steel);oval(33,22,19,14,deep);oval(32,21,16,11,teal);
      for(const [x,y] of [[27,18],[36,16],[30,25],[39,23]])oval(x,y,3,2,dark);
      line(27,18,39,23,paper,2);line(36,16,30,25,edge);
      line(39,23,49,31,paper,2);line(49,31,63,34,edge,2);line(63,34,67,29,edge);
      line(16,18,22,13,cream);
    } else if(id==='map') {
      const leaf=[[4,14],[23,8],[40,12],[57,5],[68,34],[52,44],[35,39],[17,46]];
      poly(leaf,dark);poly(leaf.map(([x,y])=>[x,y-2]),paper);
      poly([[23,7],[39,11],[51,41],[35,37]],edge);line(23,7,35,37,cream);
      line(11,18,24,21,teal,3);line(24,21,35,19,teal,3);line(35,19,48,26,teal,3);line(48,26,60,23,teal,3);
      line(24,34,34,28,red,2);line(34,28,42,16,red,2);line(42,16,52,12,red,2);line(36,23,42,19,dark,2);
    }
    return canvas;
  }
  const cache=new Map();
  window.innDrawerFinds=()=>Object.fromEntries(Object.entries(entries).map(([place,items])=>[
    place,items.map(([id,name,detail])=>{
      if(!cache.has(id)) cache.set(id,makeSprite(id));
      return {id,name,detail,sprite:cache.get(id),place};
    })
  ]));
})();
