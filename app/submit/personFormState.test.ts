import { describe, expect, it } from 'vitest'
import {
  addPerson,
  createPerson,
  PROFILE_MESSAGE_MAX_LENGTH,
  removePerson,
  updatePerson,
} from './personFormState'

describe('등록 대상별 한마디 상태', () => {
  it('각 사람은 서로 독립적인 빈 한마디 상태로 시작한다', () => {
    const people = addPerson([createPerson()])
    const updated = updatePerson(people, 0, 'message', '첫 번째에게만 남기는 말')

    expect(updated[0].message).toBe('첫 번째에게만 남기는 말')
    expect(updated[1].message).toBe('')
  })

  it('친구를 추가해도 기존 한마디를 보존하고 새 사람의 입력은 독립적이다', () => {
    const withFirstMessage = updatePerson([createPerson()], 0, 'message', '기존 메시지')
    const updated = updatePerson(addPerson(withFirstMessage), 1, 'message', '새 친구 메시지')

    expect(updated.map((person) => person.message)).toEqual(['기존 메시지', '새 친구 메시지'])
  })

  it('친구를 삭제하면 해당 사람의 한마디만 제거하고 나머지는 유지한다', () => {
    const people = [
      { ...createPerson(), message: '첫 번째' },
      { ...createPerson(), message: '삭제할 메시지' },
      { ...createPerson(), message: '세 번째' },
    ]

    expect(removePerson(people, 1).map((person) => person.message)).toEqual(['첫 번째', '세 번째'])
  })

  it('마지막 한 명은 삭제하지 않아 한마디 상태가 보존된다', () => {
    const onlyPerson = [{ ...createPerson(), message: '남아 있어야 하는 메시지' }]

    expect(removePerson(onlyPerson, 0)).toBe(onlyPerson)
  })

  it('한마디는 API 최대 길이까지만 입력 상태에 저장한다', () => {
    const overLimit = '가'.repeat(PROFILE_MESSAGE_MAX_LENGTH + 1)
    const people = updatePerson([createPerson()], 0, 'message', overLimit)

    expect(people[0].message).toHaveLength(PROFILE_MESSAGE_MAX_LENGTH)
  })
})
