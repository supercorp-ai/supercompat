import type { AIProjectClient } from '@azure/ai-projects'

export const get =
  ({
    azureAiProject,
  }: {
    azureAiProject: AIProjectClient
  }) =>
  async (_url: string, _options: any) => {
    try {
      const models: any[] = []

      // List all deployments (models) from Azure AI Project
      for await (const deployment of azureAiProject.deployments.list()) {
        if (
          deployment.type === 'ModelDeployment' &&
          'modelName' in deployment &&
          'modelPublisher' in deployment
        ) {
          // Map Azure deployment to OpenAI model format
          models.push({
            id: deployment.modelName,
            object: 'model',
            created: Date.now(),
            owned_by: deployment.modelPublisher,
          })
        }
      }

      // Return in OpenAI models.list() format
      return new Response(
        JSON.stringify({
          object: 'list',
          data: models,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    } catch (error) {
      return new Response(
        JSON.stringify({
          error,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }
  }
