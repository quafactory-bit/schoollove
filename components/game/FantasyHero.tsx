import Image from 'next/image'
import GameMotionControl from './GameMotionControl'

const lights = [[582,510,22],[686,494,16],[890,496,17],[770,475,48],[712,119,30],[716,263,14],[1362,494,15],[1109,420,14]]
const glints = [[168,526],[180,648],[300,568],[345,696],[1233,558],[1248,576],[1438,612],[1453,708],[1397,210],[1408,278],[812,71],[638,391],[947,397],[918,772],[1201,923],[960,628],[1171,717]]

/** Decorative V3 artwork; motion never represents account or school activity. */
export default function FantasyHero() {
  return <GameMotionControl className="sl-fantasy-hero" stage="decorative">
    <div className="sl-fantasy-art" aria-hidden="true">
      <div className="sl-fantasy-plane">
      <Image src="/images/fantasy-v3/hero.webp" alt="" fill sizes="100vw" priority />
      <svg className="sl-home-lighting" viewBox="0 0 1536 1024" focusable="false">
        <defs>
          <radialGradient id="sl-home-lamp"><stop stopColor="#fffde1" stopOpacity=".95"/><stop offset=".28" stopColor="#ffe7a0" stopOpacity=".75"/><stop offset="1" stopColor="#ffbe50" stopOpacity="0"/></radialGradient>
          <linearGradient id="sl-home-water" x2="0" y2="1"><stop stopColor="#ffffff"/><stop offset=".5" stopColor="#adf6ff"/><stop offset="1" stopColor="#d9deff" stopOpacity=".2"/></linearGradient>
          <linearGradient id="sl-home-gold"><stop stopColor="#ffe0a0" stopOpacity="0"/><stop offset=".5" stopColor="#fff8cd" stopOpacity=".85"/><stop offset="1" stopColor="#ffe0a0" stopOpacity="0"/></linearGradient>
          <clipPath id="sl-home-flags"><path d="M755 43L813 55 824 86 888 100 908 127 822 108 802 87 754 78Z M612 326L666 326 667 434 637 478 611 443Z M917 325L973 328 974 460 947 497 917 466Z M896 701L940 727 941 864 914 903 895 880Z M1165 814L1249 848 1250 1024 1159 1024Z"/></clipPath>
        </defs>
        <g className="sl-home-lamps">{lights.map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r*1.8} fill="url(#sl-home-lamp)" className="sl-lamp-glow" style={{animationDelay:`-${i*.47}s`}}/>)}</g>
        <g fill="none" stroke="url(#sl-home-water)" strokeWidth="3" strokeLinecap="round" className="sl-water-streams">
          {['M165 471Q150 540 167 628L157 695','M190 475Q174 534 181 604L177 715','M308 489Q289 562 297 637L286 738','M350 617Q333 686 350 753','M1227 545Q1236 559 1239 578','M1441 565Q1454 641 1442 746','M1393 148Q1406 204 1398 304'].map((d,i)=><path key={d} d={d} className="sl-water-flow" style={{animationDelay:`-${i*.51}s`}}/>)}
        </g>
        <g clipPath="url(#sl-home-flags)" className="sl-flag-highlights">
          {[{x:750,y:38,h:100},{x:601,y:317,h:175},{x:906,y:315,h:195},{x:881,y:685,h:230},{x:1140,y:790,h:255}].map(({x,y,h},i)=><path key={x} d={`M${x-35} ${y}h34l65 ${h}h-34Z`} fill="url(#sl-home-gold)" className="sl-flag-sheen" style={{animationDelay:`-${i*.83}s`}}/>)}
        </g>
        {glints.map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})`}><g className={`sl-detail-glint ${i<10?'sl-detail-glint--water':'sl-detail-glint--gold'}`} style={{animationDelay:`-${i*.39}s`}}><path d="M0-13 2-2 13 0 2 2 0 13-2 2-13 0-2-2Z"/><circle r="3" fill="#fff"/></g></g>)}
      </svg>
      </div>
    </div>
  </GameMotionControl>
}
