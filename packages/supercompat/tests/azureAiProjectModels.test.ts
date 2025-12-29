import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { azureAiProjectClientAdapter, supercompat } from '../src/index'

const azureEndpoint = process.env.AZURE_PROJECT_ENDPOINT
const azureTenantId = process.env.AZURE_TENANT_ID
const azureClientId = process.env.AZURE_CLIENT_ID
const azureClientSecret = process.env.AZURE_CLIENT_SECRET

if (!azureEndpoint || !azureTenantId || !azureClientId || !azureClientSecret) {
  console.error('Azure credentials not found in environment variables')
  process.exit(1)
}

const cred = new ClientSecretCredential(
  azureTenantId,
  azureClientId,
  azureClientSecret,
)

const azureAiProject = new AIProjectClient(azureEndpoint, cred)

test('azureAiProject: list models via deployments', async () => {
  console.log('Testing Azure AI Project models.list() endpoint...')

  // Create supercompat client with Azure AI Project adapter
  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
  })

  // List models
  const modelsList = await client.models.list()
  const models = []
  for await (const model of modelsList) {
    models.push(model)
  }

  console.log(`Found ${models.length} model deployments`)

  // Verify we got models
  assert.ok(models.length > 0, 'Should return at least one model deployment')

  // Verify model structure
  const firstModel = models[0]
  assert.ok(firstModel.id, 'Model should have an id')
  assert.strictEqual(firstModel.object, 'model', 'Model object should be "model"')
  assert.ok(firstModel.owned_by, 'Model should have an owned_by field')

  console.log('Sample model:', JSON.stringify(firstModel, null, 2))

  // Log all model IDs for verification
  console.log('Available models:', models.map(m => m.id).join(', '))
})

test('azureAiProject: models endpoint returns correct format', async () => {
  console.log('Testing Azure AI Project models endpoint format...')

  // Create supercompat client
  const client = supercompat({
    client: azureAiProjectClientAdapter({
      azureAiProject,
    }),
  })

  // List models
  const modelsList = await client.models.list()

  // The response should be an async iterable
  assert.ok(
    typeof modelsList[Symbol.asyncIterator] === 'function',
    'models.list() should return an async iterable'
  )

  // Collect all models
  const models = []
  for await (const model of modelsList) {
    models.push(model)

    // Verify each model has required fields
    assert.ok(model.id, 'Each model must have an id')
    assert.strictEqual(
      model.object,
      'model',
      'Each model object field must be "model"'
    )
    assert.ok(
      typeof model.created === 'number',
      'Each model must have a created timestamp'
    )
    assert.ok(
      typeof model.owned_by === 'string',
      'Each model must have an owned_by string'
    )
  }

  console.log(`Verified ${models.length} model deployments have correct format`)
})
