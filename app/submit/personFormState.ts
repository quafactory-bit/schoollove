import type { PersonInput } from './registerPeople'

// POST /api/profiles의 message schema와 동일한 상한이다. UI에서는 입력 시점에만
// 길이를 제한하고, 공백 정리 및 null 변환은 registerPeople의 payload 경계에서 한다.
export const PROFILE_MESSAGE_MAX_LENGTH = 30

export function createPerson(isSelf = false): PersonInput {
  return { nickname: '', instagram: '', isSelf, message: '' }
}

export function addPerson(people: PersonInput[]): PersonInput[] {
  return [...people, createPerson()]
}

export function removePerson(people: PersonInput[], index: number): PersonInput[] {
  if (people.length === 1) return people
  return people.filter((_, currentIndex) => currentIndex !== index)
}

export function updatePerson<K extends keyof PersonInput>(
  people: PersonInput[],
  index: number,
  key: K,
  value: PersonInput[K]
): PersonInput[] {
  return people.map((person, currentIndex) => {
    if (currentIndex !== index) return person

    const nextValue = key === 'message' && typeof value === 'string'
      ? value.slice(0, PROFILE_MESSAGE_MAX_LENGTH)
      : value

    return { ...person, [key]: nextValue } as PersonInput
  })
}
