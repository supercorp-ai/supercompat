import OpenAI from 'openai'

const runs = new Map<string, OpenAI.Beta.Threads.Run>()

export const setRun = (run: OpenAI.Beta.Threads.Run) => {
  runs.set(run.id, run)
}

export const getRun = (id: string) => runs.get(id)
