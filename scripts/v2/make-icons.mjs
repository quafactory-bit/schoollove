// v2-08: public/icons/icon-v2.svg(초록 둥근 사각형 + 흰 체크)에서 PNG 아이콘을 새 이름으로 만든다.
// 기존 icon-192/512 등은 덮어쓰지 않는다(마스터 규칙 6). 실행: node scripts/v2/make-icons.mjs
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/icons/icon-v2.svg')
// maskable: 모서리 없이 꽉 채우고 체크는 안전 영역(가운데 80%) 안에 둔다.
const maskable = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0f7b5f"/><path d="M166 264l66 66 128-148" fill="none" stroke="#ffffff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/></svg>')
// apple-touch-icon: iOS가 모서리를 둥글게 깎으므로 꽉 채운 사각형.
const apple = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0f7b5f"/><path d="M146 266l76 76 148-170" fill="none" stroke="#ffffff" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/></svg>')

await sharp(svg).resize(192, 192).png().toFile('public/icons/icon-v2-192.png')
await sharp(svg).resize(512, 512).png().toFile('public/icons/icon-v2-512.png')
await sharp(maskable).resize(512, 512).png().toFile('public/icons/icon-v2-maskable-512.png')
await sharp(apple).resize(180, 180).png().toFile('public/icons/apple-touch-icon-v2.png')
console.log('icons written')
