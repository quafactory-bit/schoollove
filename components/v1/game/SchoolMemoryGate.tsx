import { useId } from 'react'

/** Original UI geometry, not derived from rejected raster candidates.
 * Coordinates share the accepted campus's 1000x667 canvas and ground plane.
 * Bevelled faces keep the silhouette identifiable without glow or color.
 */
export default function SchoolMemoryGate() {
  const id = useId()
  return <svg className="sl-memory-gate" data-campus-structure="memory-gate"
    viewBox="0 0 1000 667" width="1000" height="667" fill="none"
    aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-stone`} x1=".1" y1="0" x2=".9" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#fff1ca" /><stop offset=".45" stopColor="#eed1a5" /><stop offset="1" stopColor="#c79468" />
      </linearGradient>
      <linearGradient id={`${id}-slate`} x1="0" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#a7bdd0" /><stop offset=".4" stopColor="#6389b3" /><stop offset="1" stopColor="#345880" />
      </linearGradient>
      <radialGradient id={`${id}-contact`}>
        <stop stopColor="#304426" stopOpacity=".35" /><stop offset="1" stopColor="#304426" stopOpacity="0" />
      </radialGradient>
    </defs>
    <g transform="translate(46 65) scale(.84)">
    {/* Ground contact, receding paving and three shallow terrace steps. */}
    <ellipse data-gate-contact="" cx="287" cy="371" rx="125" ry="28" fill={`url(#${id}-contact)`} />
    <path d="M190 367 342 347 386 371 229 397Z" fill="#ae8462" />
    <path d="M190 360 342 340 386 364 229 390Z" fill="#f6d9af" />
    <path d="M229 390 386 364V371L229 397Z" fill="#c89b73" />
    <path d="M205 353 331 337 367 355 239 377Z" fill="#fff0cf" />
    <path d="M239 377 367 355V362L239 384Z" fill="#d0a27a" />
    <path d="M219 345 321 332 350 345 245 365Z" fill="#efd0a4" />
    {/* Far faces of the arch: offset depth is visible through the opening. */}
    <path d="M239 346V238C239 157 373 149 373 230V334L350 345V233C350 181 265 191 265 243V355Z"
      fill="#bd8e68" />
    <path d="M265 355V243C265 191 350 181 350 233V345L335 339V239C335 201 281 209 281 248V350Z"
      fill="#d6a87b" />
    {/* Main masonry arch and pillars; the opening is genuine unpainted space. */}
    <path d="M214 359V249C214 165 350 151 350 237V345L315 351V241C315 198 250 207 250 249V364Z"
      fill={`url(#${id}-stone)`} />
    <path d="M214 249C214 165 350 151 350 237L337 239C337 172 227 182 227 250Z" fill="#fff0cb" />
    <path d="M227 354V250C227 182 337 172 337 239V342" stroke="#fbe3b9" strokeWidth="6" />
    <path d="M250 364V249C250 207 315 198 315 241V351" stroke="#b58460" strokeWidth="5" />
    {/* Individual voussoirs, keystone and inset panels, no text or school mark. */}
    <path d="m218 227 29 8m-17-41 23 20m6-39 12 30m24-36-2 32m33-22-15 28m33-5-23 17m29 15-30 6"
      stroke="#c99d71" strokeWidth="2.5" />
    <path d="m270 173 23-3-2 32-15 2Z" fill="#ffe9bd" stroke="#d6ad7d" strokeWidth="2" />
    <path d="m222 267 20-2v75l-20 3Zm101-10 19-2v72l-19 4Z" fill="#e4b987" />
    <path d="m225 270 3 69m99-79 3 65" stroke="#fff0cc" strokeWidth="3" />
    {/* Blue slate coping with warm sunlit rims, matching the campus roofs. */}
    <path d="M202 248C200 149 349 131 365 231L349 238C338 158 224 176 224 250Z" fill={`url(#${id}-slate)`} />
    <path d="M202 248C200 149 349 131 365 231L376 220C355 122 217 132 210 229Z" fill={`url(#${id}-slate)`} />
    <path d="M202 248C200 149 349 131 365 231" stroke="#a8bfd0" strokeWidth="4" />
    <path d="M207 251C206 161 343 143 359 235" stroke="#e6cfaa" strokeWidth="5" />
    <path d="m216 212 10-8m6-21 9-7m19-22 2 9m26-19 1 10m24-8-3 11m20 6-6 10m16 11-7 8m16 12-7 8"
      stroke="#cad4d6" strokeWidth="2" opacity=".6" />
    <path d="m211 252 32-4 10 7-33 5Zm101-11 35-5 10 7-35 6Z" fill="#ffe5b5" />
    <path d="m211 252 9 8v8l-9-7Zm9 8 33-5v8l-33 5Zm102-11 35-6v8l-35 6Z" fill="#c99b70" />
    {/* Wide plinths anchor both columns to the terrace. */}
    <path d="m203 345 40-6 16 11-40 8Zm104-11 37-6 17 10-38 7Z" fill="#ffe7c1" />
    <path d="m203 345 16 13v13l-16-12Zm16 13 40-8v13l-40 8Zm88-24 16 11v13l-16-11Zm16 11 38-7v13l-38 7Z" fill="#ce9e74" />
    <path d="m217 356 39-7m-35 13 35-7m65-12 36-7" stroke="#f8d9a9" strokeWidth="3" />
    {/* Low garden walls and rounded capstones, not a flat icon badge. */}
    <path d="M165 340 199 336 215 345 181 353V365L165 354Z" fill="#ddb183" />
    <path d="M165 338 198 332 217 341 181 350Z" fill="#fff0d0" />
    <path d="M181 350 217 341V355L181 365Z" fill="#ba8965" />
    <path d="M355 326 390 320 411 330 373 340V353L355 342Z" fill="#c4966e" />
    <path d="M353 324 390 317 412 328 373 338Z" fill="#ffe9c4" />
    <path d="M373 338 412 328V341L373 353Z" fill="#ae7e5c" />
    {/* Small planted bases soften the meeting with the accepted garden art. */}
    <ellipse cx="177" cy="359" rx="22" ry="10" fill="#446b36" />
    <ellipse cx="170" cy="355" rx="13" ry="9" fill="#718d3f" />
    <ellipse cx="186" cy="352" rx="12" ry="10" fill="#8eaa4b" />
    <ellipse cx="393" cy="347" rx="24" ry="10" fill="#3d6834" />
    <ellipse cx="386" cy="340" rx="14" ry="11" fill="#7a9a42" />
    <ellipse cx="404" cy="343" rx="12" ry="9" fill="#91aa4d" />
    <g fill="#f4b7ca"><circle cx="168" cy="351" r="3" /><circle cx="182" cy="348" r="3" /><circle cx="395" cy="337" r="3" /></g>
    <g fill="#fff0c1"><circle cx="176" cy="352" r="2.5" /><circle cx="187" cy="354" r="2.5" /><circle cx="405" cy="340" r="2.5" /></g>
    </g>
  </svg>
}
