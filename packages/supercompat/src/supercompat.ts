import OpenAI from 'openai'
import { deepmerge } from 'deepmerge-ts'
import { partob, crush, set } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'

// class Supercompat extends OpenAI {
//   constructor({
//     client,
//     storage,
//   }: {
//     client: OpenAI
//     storage: OpenAI
//   }) {
//     super({
//       apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
//     })
//     const storageFunctions = crush(storage)
//
//     console.log('before')
//     console.dir({ thiss: this, storageFunctions }, { depth: null })
//
//     for (const [key, value] of Object.entries(storageFunctions)) {
//       console.log({ key, value, t: this })
//       set(this, key, value)
//       // this[key] = value
//     }
//
//     console.log('after')
//     console.dir({ thiss: this }, { depth: null })
//
//     // console.log({ cru })
//     // this = deepmerge(this, client, storage)
//     // console.log({ client, storage })
//     // this.client = client
//     // this.storage = storage
//   }
// }
//
// type MethodOverrides<T> = {
//   [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : MethodOverrides<T[K]>;
// };
//
// function applyMethodOverrides<T>(instance: T, methodOverrides: MethodOverrides<T>, seen = new WeakMap()): T {
//   // Avoid circular dependencies by tracking seen objects
//   // @ts-ignore-next-line
//   if (seen.has(instance)) {
//     return instance;
//   }
//   // @ts-ignore-next-line
//   seen.set(instance, true);
//
//   for (const key in methodOverrides) {
//     if (methodOverrides.hasOwnProperty(key)) {
//       if (typeof methodOverrides[key] === 'function') {
//         // Override method
//   // @ts-ignore-next-line
//         instance[key] = methodOverrides[key];
//   // @ts-ignore-next-line
//       } else if (typeof methodOverrides[key] === 'object' && instance[key] && !seen.has(instance[key])) {
//         // Recurse into nested objects, avoid already seen objects
//   // @ts-ignore-next-line
//         applyMethodOverrides(instance[key], methodOverrides[key], seen);
//       } else {
//         // Override property
//   // @ts-ignore-next-line
//         instance[key] = methodOverrides[key];
//       }
//     }
//   }
//
//   return instance;
// }
//
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
  const requestHandlers = getRequestHandlers({
    client,
    storage,
    runAdapter,
  })

  console.dir({ requestHandlers }, { depth: null })

  return (...args: any[]) => {
    const [url, options] = args
    console.dir({ args, url }, { depth: null })

    // @ts-ignore-next-line
    const pathHandler = requestHandlers[url]

    if (!pathHandler) {
      // @ts-ignore-next-line
      return fetch(...args)
    }

    const requestHandler = pathHandler[options?.method]

    if (!requestHandler) {
      // @ts-ignore-next-line
      return fetch(...args)
    }

    return requestHandler(...args)
  }
}

  // const openai = new OpenAI({
  //   apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
  // })
  // console.dir({ openai }, { depth: null })

  // @ts-ignore-next-line
  // const keys = x => Object.getOwnPropertyNames(x).concat(Object.getOwnPropertyNames(x?.__proto__))
  // // @ts-ignore-next-line
  // const isObject = v => Object.prototype.toString.call(v) === '[object Object]'
  //
  // // @ts-ignore-next-line
  // const classToObject = clss => keys(clss ?? {}).reduce((object, key) => {
  //   const [val, arr, obj] = [clss[key], Array.isArray(clss[key]), isObject(clss[key])]
  //   // @ts-ignore-next-line
  //   object[key] = arr ? val.map(classToObject) : obj ? classToObject(val) : val
  //   return object
  // }, {})
  //
  // const clientFunctions = crush(classToObject(client))
  // console.dir({ clientFunctions }, { depth: null })
  //
  // for (const [key, value] of Object.entries(clientFunctions)) {
  //   console.log('client', { key, value, t: openai })
  //   set(openai, key, value)
  //   // this[key] = value
  // }
  //
  // const storageFunctions = crush(storage({
  //   runAdapter: partob(runAdapter, { client }),
  // }))
  //
  // console.dir({ storageFunctions }, { depth: null })
  // console.log({ proto: openai })
  // for (const [key, value] of Object.entries(storageFunctions)) {
  //   console.log({ key, value, t: openai })
  //   set(openai, key, value)
  //   // this[key] = value
  // }

  // const withGrok = applyMethodOverrides(openai, client)
  // const final = applyMethodOverrides(withGrok, storage({
  //   runAdapter: partob(runAdapter, { client }),
  // }))
  // console.dir({ again: 1, openai, client, final, withGrok }, { depth: null })
  // return final
  //
  // //
  // // // const openai = new Supercompat({
  // // //   client,
  // // //   storage: storage({
  // // //     runAdapter: partob(runAdapter, { client }),
  // // //   }),
  // // // })
  //
  // return openai
  //
  // // return openai
  // //
  // // console.dir({ openai }, { depth: null })
  // // console.dir({ client }, { depth: null })
  // //
  // // console.dir({
  // //   storage: storage({
  // //     runAdapter: partob(runAdapter, { client }),
  // //   }),
  // // })
  // //
  // // return deepmerge(
  // //   openai,
  // //   client,
  // //   storage({
  // //     runAdapter: partob(runAdapter, { client }),
  // //   }),
  // // )
// }
