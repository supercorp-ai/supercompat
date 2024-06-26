import OpenAI from 'openai'
import { deepmerge } from 'deepmerge-ts'
import { partob, crush, set } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'

type MethodOverrides<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : MethodOverrides<T[K]>;
};

function applyMethodOverrides<T>(instance: T, methodOverrides: MethodOverrides<T>, seen = new WeakMap()): T {
  // Avoid circular dependencies by tracking seen objects
  // @ts-ignore-next-line
  if (seen.has(instance)) {
    return instance;
  }
  // @ts-ignore-next-line
  seen.set(instance, true);

  for (const key in methodOverrides) {
    if (methodOverrides.hasOwnProperty(key)) {
      if (typeof methodOverrides[key] === 'function') {
        // Override method
  // @ts-ignore-next-line
        instance[key] = methodOverrides[key];
  // @ts-ignore-next-line
      } else if (typeof methodOverrides[key] === 'object' && instance[key] && !seen.has(instance[key])) {
        // Recurse into nested objects, avoid already seen objects
  // @ts-ignore-next-line
        applyMethodOverrides(instance[key], methodOverrides[key], seen);
      } else {
        // Override property
  // @ts-ignore-next-line
        instance[key] = methodOverrides[key];
      }
    }
  }

  return instance;
}

// @ts-ignore-next-line
export const supercompat = ({
  client,
  storage,
  runAdapter,
}: {
  client: OpenAI
  storage: (arg0: StorageAdapterArgs) => OpenAI
  runAdapter: RunAdapter
}) => {
  const openai = new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
  })

  const withGrok = applyMethodOverrides(openai, client)
  const final = applyMethodOverrides(withGrok, storage({
    runAdapter: partob(runAdapter, { client }),
  }))

  console.dir({ again: 1, openai, client, final, withGrok }, { depth: null })
  return final
}
