import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ClassHistoryEditor from '@/components/account/ClassHistoryEditor'
import type { SchoolMembership } from '@/lib/account'
import { formatGradeClassHistory } from '@/lib/accountGradeClass'

const globals = window as unknown as { fixture: (kind: string, writable: boolean, rows: SchoolMembership['class_history']) => void; refreshFixture: () => void; savedRows: SchoolMembership['class_history'] }
function Fixture() {
  const [kind, setKind] = useState('high')
  const [writable, setWritable] = useState(true)
  const [rows, setRows] = useState<SchoolMembership['class_history']>([])
  const [version, setVersion] = useState(0)
  globals.fixture = (nextKind, allowed, history) => { setKind(nextKind); setWritable(allowed); setRows(history); setVersion(n => n + 1) }
  globals.refreshFixture = () => setRows(globals.savedRows)
  const membership: SchoolMembership = {
    id: '00000000-0000-4000-8000-000000000001', school_id: '00000000-0000-4000-8000-000000000002',
    graduation_year: 2010, class_number: null, class_history: rows,
    school: { id: '00000000-0000-4000-8000-000000000002', school_name: 'Synthetic School', school_type: kind, sido: 'Test', sigungu: 'Test', slug: 'synthetic-school' },
  }
  return <main className="mx-auto max-w-2xl px-5 py-10"><section className="mt-5 border p-5"><ul><li className="min-w-0 border p-4">
    <h2>Synthetic School</h2><p>2010년 졸업</p><p data-testid="history">{formatGradeClassHistory(rows)}</p>
    <ClassHistoryEditor key={version} membership={membership} writable={writable} />
  </li></ul></section></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
