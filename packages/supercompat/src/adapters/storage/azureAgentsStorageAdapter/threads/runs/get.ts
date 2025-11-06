import type OpenAI from 'openai'

type RunListResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Runs.RunsPage>
}

export const get =
  () =>
  async (): Promise<RunListResponse> => {
    // Azure Agents doesn't provide a way to list runs
    // Return an empty list
    const response = {
      data: [],
      first_id: null,
      last_id: null,
      has_more: false,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
