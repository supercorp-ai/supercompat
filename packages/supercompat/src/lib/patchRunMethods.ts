import OpenAI, { AzureOpenAI } from 'openai'

export const patchRunMethods = (oai: OpenAI | AzureOpenAI) => {
  const runs = (oai as any).beta.threads.runs

  const submitToolOutputs = runs.submitToolOutputs.bind(runs)
  runs.submitToolOutputs = ((arg1: any, arg2?: any, arg3?: any) => {
    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      return submitToolOutputs(arg2, { ...(arg3 || {}), thread_id: arg1 })
    }
    return submitToolOutputs(arg1, arg2)
  }) as any

  const submitToolOutputsStream = runs.submitToolOutputsStream.bind(runs)
  runs.submitToolOutputsStream = ((arg1: any, arg2?: any, arg3?: any) => {
    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      return submitToolOutputsStream(arg2, {
        ...(arg3 || {}),
        thread_id: arg1,
      })
    }
    return submitToolOutputsStream(arg1, arg2)
  }) as any

  return oai
}
