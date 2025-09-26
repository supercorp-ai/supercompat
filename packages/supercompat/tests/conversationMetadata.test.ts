import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  appendItemIdsToConversationMetadata,
  saveResponseItemsToConversationMetadata,
} from '../src/lib/responses/saveResponseItemsToConversationMetadata'

type Meta = Record<string, string>

const LONG_ITEM_SUFFIX = 'x'.repeat(450)
const MEDIUM_ITEM_SUFFIX = 'x'.repeat(200)

function normalizeBucketKeys(metadata: Meta) {
  return Object.keys(metadata)
    .filter((key) => key.startsWith('responseItemsMap'))
    .sort((a, b) => Number(a.replace('responseItemsMap', '')) - Number(b.replace('responseItemsMap', '')))
}

function metadataValuesWithinLimits(metadata: Meta) {
  return Object.entries(metadata).every(([key, value]) => {
    if (key.startsWith('responseItemsMap')) {
      return value.length <= 512
    }
    return true
  })
}

test('appendItemIdsToConversationMetadata respects metadata limits when non-map keys fill most slots', () => {
  const metadata: Meta = {}
  for (let i = 0; i < 12; i += 1) {
    metadata[`custom${i}`] = `value${i}`
  }
  for (let i = 0; i < 4; i += 1) {
    metadata[`responseItemsMap${i}`] = JSON.stringify([
      {
        responseId: `old${i}`,
        itemIds: [`${i}-${LONG_ITEM_SUFFIX}`],
      },
    ])
  }

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'new',
    itemIds: [`n-${LONG_ITEM_SUFFIX}`],
  })

  const keys = Object.keys(updated)
  assert.equal(keys.length, 16)
  assert.equal(changed, true)
  const bucketKeys = normalizeBucketKeys(updated)
  assert.deepEqual(bucketKeys, ['responseItemsMap0', 'responseItemsMap1', 'responseItemsMap2', 'responseItemsMap3'])

  const entries = bucketKeys.flatMap((key) => JSON.parse(updated[key]!))
  const responseIds = entries.map((entry: { responseId: string }) => entry.responseId)
  assert.ok(responseIds.includes('new'))
  assert.ok(!responseIds.includes('old0'))
  assert.ok(metadataValuesWithinLimits(updated))
})

const FULL_METADATA: Meta = {
  assistantId: '24c0c6d2-4f74-4685-9139-1fb33d599168',
  responseItemsMap0:
    '[{"responseId":"resp_68d5e6675f9c8197858f8013e5bc58c30c9d91ec4223f20a","itemIds":["cu_68d5e6687c5c81979f5a1d08a8c380250c9d91ec4223f20a"]},{"responseId":"resp_68d5e66beab88197aa82541e3e325c9a0c9d91ec4223f20a","itemIds":["rs_68d5e66ef0008197a4019a55f3f3bc380c9d91ec4223f20a","cu_68d5e6714da88197b20c260c32951a120c9d91ec4223f20a"]},{"responseId":"resp_68d5e673bfe08197a1d4e84c659207a90c9d91ec4223f20a","itemIds":["cu_68d5e677fa348197b261ff68cfbd14330c9d91ec4223f20a"]}]',
  responseItemsMap1:
    '[{"responseId":"resp_68d5e67c0c448197bb522164e5012cf50c9d91ec4223f20a","itemIds":["rs_68d5e67ffa4481979d2113f6747d1b4a0c9d91ec4223f20a","cu_68d5e683486c8197a122f2689b2505030c9d91ec4223f20a"]},{"responseId":"resp_68d5e6869bc481979edaf81c05c16de10c9d91ec4223f20a","itemIds":["cu_68d5e68c01108197afcc40e7e72599790c9d91ec4223f20a"]},{"responseId":"resp_68d5e68faa248197b1c47455d0321c7e0c9d91ec4223f20a","itemIds":["rs_68d5e6950f588197b84a8341bcb40dfa0c9d91ec4223f20a"]}]',
  responseItemsMap2:
    '[{"responseId":"resp_68d5e68faa248197b1c47455d0321c7e0c9d91ec4223f20a","itemIds":["cu_68d5e6995ee481978b2d485adb8a86ae0c9d91ec4223f20a"]},{"responseId":"resp_68d5e69e0f8c81979bf14cf4e8b5c9900c9d91ec4223f20a","itemIds":["rs_68d5e6a44f0081978d4a5d34b49f6e6e0c9d91ec4223f20a","cu_68d5e6a98f5481979620379cf92da3400c9d91ec4223f20a"]},{"responseId":"resp_68d5e6ac3eac8197b86df44f73acfe5e0c9d91ec4223f20a","itemIds":["cu_68d5e6b0069881978d356212636ac7c60c9d91ec4223f20a"]}]',
  responseItemsMap3:
    '[{"responseId":"resp_68d5e6bc3a348197a1116f8b890a1f750c9d91ec4223f20a","itemIds":["rs_68d5e6c26f708197ba2005598f8151280c9d91ec4223f20a","cu_68d5e6c79df081979778ef921eac69ac0c9d91ec4223f20a"]},{"responseId":"resp_68d5e6d0edf481979d51423164dd25680c9d91ec4223f20a","itemIds":["rs_68d5e6d5c9948197ad37ea34e9d281b10c9d91ec4223f20a","msg_68d5e6daf0d0819783da8be448aa74070c9d91ec4223f20a"]}]',
  responseItemsMap4:
    '[{"responseId":"resp_68d5e764edc88197a82b7fa9bf64876f0c9d91ec4223f20a","itemIds":["cu_68d5e76903bc8197a4649fdceef57b4a0c9d91ec4223f20a"]},{"responseId":"resp_68d5e772dba48197be3ab5697f50d09c0c9d91ec4223f20a","itemIds":["rs_68d5e77906908197861129bd8a5d59930c9d91ec4223f20a","cu_68d5e77cf3bc8197a1df033f3865bdfd0c9d91ec4223f20a"]},{"responseId":"resp_68d5e786065c81979debfc1237bcb2ba0c9d91ec4223f20a","itemIds":["cu_68d5e78b0d18819780d99990635e3cf50c9d91ec4223f20a"]}]',
  responseItemsMap5:
    '[{"responseId":"resp_68d5e79137f88197b4edb7259945a4670c9d91ec4223f20a","itemIds":["cu_68d5e7955b6c8197b692dd9698ce06090c9d91ec4223f20a"]},{"responseId":"resp_68d5e798d84c8197ba911a769369af840c9d91ec4223f20a","itemIds":["cu_68d5e79f9c4c8197b4fa8ff72c10ee6e0c9d91ec4223f20a"]},{"responseId":"resp_68d5e7a2cc9c8197a3c7b7b125381a470c9d91ec4223f20a","itemIds":["cu_68d5e7aa44ac8197a72d8e7282c556660c9d91ec4223f20a"]}]',
  responseItemsMap6:
    '[{"responseId":"resp_68d5e7b2a4808197a9f437fa56d5bb4b0c9d91ec4223f20a","itemIds":["rs_68d5e7b8f67481978654f75214513fe90c9d91ec4223f20a","cu_68d5e7bd4fcc819792903e0a58ac4f880c9d91ec4223f20a"]},{"responseId":"resp_68d5e7c0c0548197be1c8a7fa6d75f7d0c9d91ec4223f20a","itemIds":["cu_68d5e7c4b4108197a4f208c48acc700c0c9d91ec4223f20a"]},{"responseId":"resp_68d5e7d2325c8197bd3bc811f290c5210c9d91ec4223f20a","itemIds":["rs_68d5e7d7a810819795a91b3bf7271eba0c9d91ec4223f20a"]}]',
  responseItemsMap7:
    '[{"responseId":"resp_68d5e7d2325c8197bd3bc811f290c5210c9d91ec4223f20a","itemIds":["msg_68d5e7dcb97c8197b143b590f9ebb7800c9d91ec4223f20a"]},{"responseId":"resp_68d5e8070c008197a4bfd24ecd82b2120c9d91ec4223f20a","itemIds":["cu_68d5e80dc26c81979fa8de1197f87e250c9d91ec4223f20a"]},{"responseId":"resp_68d5e81685088197b9df2698b6dd62180c9d91ec4223f20a","itemIds":["rs_68d5e81a9cf88197b48549e1e76b2e340c9d91ec4223f20a","cu_68d5e81ef348819793a4772783f87d9a0c9d91ec4223f20a"]}]',
  responseItemsMap8:
    '[{"responseId":"resp_68d5e82331608197bb6bf22491a79f0b0c9d91ec4223f20a","itemIds":["cu_68d5e826b6708197b145e53e67dbe14a0c9d91ec4223f20a"]},{"responseId":"resp_68d5e829b7608197a7a9013bcc855aa80c9d91ec4223f20a","itemIds":["cu_68d5e82db0608197b330321077dd2e620c9d91ec4223f20a"]},{"responseId":"resp_68d5e830b4488197b71246182e65a6080c9d91ec4223f20a","itemIds":["cu_68d5e83604448197899eda54fec3423d0c9d91ec4223f20a"]}]',
  responseItemsMap9:
    '[{"responseId":"resp_68d5e8391b2881978307e2061060b2ad0c9d91ec4223f20a","itemIds":["cu_68d5e83e4f988197ab156b665b9863db0c9d91ec4223f20a"]},{"responseId":"resp_68d5e8429e1c8197be551774122ff5970c9d91ec4223f20a","itemIds":["rs_68d5e8480e1c8197931c5fea091680e50c9d91ec4223f20a","cu_68d5e84c4f708197b220dfbfa34dd55a0c9d91ec4223f20a"]},{"responseId":"resp_68d5e8504ec081978a48ccededf4f1320c9d91ec4223f20a","itemIds":["rs_68d5e854a2b881978261b79966ce4b230c9d91ec4223f20a"]}]',
  responseItemsMap10:
    '[{"responseId":"resp_68d5e8504ec081978a48ccededf4f1320c9d91ec4223f20a","itemIds":["msg_68d5e857fdec81978c4b6a3be0f406480c9d91ec4223f20a"]},{"responseId":"resp_68d5e87692c0819783f004d7066404d20c9d91ec4223f20a","itemIds":["cu_68d5e87ae7f4819796108c87085404cf0c9d91ec4223f20a"]},{"responseId":"resp_68d5e8816ea48197b2f3822e2573ed5a0c9d91ec4223f20a","itemIds":["rs_68d5e888d388819796c5a4a344d497160c9d91ec4223f20a","cu_68d5e88c6bc88197bd9bce8f9d8be9170c9d91ec4223f20a"]}]',
  responseItemsMap11:
    '[{"responseId":"resp_68d5e88f68488197a3e53b668e30cde50c9d91ec4223f20a","itemIds":["cu_68d5e89609c4819794ca35307484eaa30c9d91ec4223f20a"]},{"responseId":"resp_68d5e89a0e0081978dee108e17a8a3e70c9d91ec4223f20a","itemIds":["cu_68d5e89e3c1c8197913f572e6ac015520c9d91ec4223f20a"]},{"responseId":"resp_68d5e8a1742481979f7a433c3e4e55de0c9d91ec4223f20a","itemIds":["cu_68d5e8a946708197a46a1a36ce99c5da0c9d91ec4223f20a"]}]',
  responseItemsMap12:
    '[{"responseId":"resp_68d5e8ac8d34819790febdf41d6468480c9d91ec4223f20a","itemIds":["cu_68d5e8b0e8548197a43be84df8aec2f20c9d91ec4223f20a"]},{"responseId":"resp_68d5e8b4df648197bbad2d778ae3bceb0c9d91ec4223f20a","itemIds":["rs_68d5e8b8ab5c8197a0a44cb02ca464440c9d91ec4223f20a","msg_68d5e8be73948197a0add3f808eccf9f0c9d91ec4223f20a"]},{"responseId":"resp_68d5e8d1c6388197b9a17d3255ad20380c9d91ec4223f20a","itemIds":["cu_68d5e8d60c5c8197acd7f889b0c3c97f0c9d91ec4223f20a"]}]',
  responseItemsMap13:
    '[{"responseId":"resp_68d5e8da0c388197a9fafbb0a38aea380c9d91ec4223f20a","itemIds":["rs_68d5e8de56488197aa7679a5d7b000140c9d91ec4223f20a","cu_68d5e8e1109081978ab4728a4fff4e920c9d91ec4223f20a"]},{"responseId":"resp_68d5e8e3ac588197a267efab84ab87650c9d91ec4223f20a","itemIds":["cu_68d5e8e92db48197a5bd4bf62e47c6c80c9d91ec4223f20a"]},{"responseId":"resp_68d5e8ec8e348197ae32795d30ecae0a0c9d91ec4223f20a","itemIds":["cu_68d5e8f2920881979bcd5e33f63c46bc0c9d91ec4223f20a"]}]',
  threadId: 'd98bcc1b-324a-42bc-9d3b-1737dec25308',
}

test('appendItemIdsToConversationMetadata rebuilds sequential buckets and keeps newest data when metadata is full', () => {
  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata: FULL_METADATA,
    responseId: 'resp_new',
    itemIds: ['cu_new'],
  })

  const keys = Object.keys(updated)
  assert.ok(keys.length <= 16)
  const nonMapKeys = keys.filter((key) => !key.startsWith('responseItemsMap'))
  assert.deepEqual(nonMapKeys.sort(), ['assistantId', 'threadId'])

  const bucketKeys = normalizeBucketKeys(updated)
  assert.deepEqual(
    bucketKeys,
    bucketKeys.map((_, index) => `responseItemsMap${index}`),
    'bucket keys should be reindexed sequentially',
  )

  const flattened = bucketKeys.flatMap((key) => JSON.parse(updated[key]!))
  const responseIds = flattened.map((entry: { responseId: string }) => entry.responseId)
  assert.ok(responseIds.includes('resp_new'))
  assert.ok(metadataValuesWithinLimits(updated))

  // Oldest response should disappear when everything is already full.
  assert.ok(!responseIds.includes('resp_68d5e6675f9c8197858f8013e5bc58c30c9d91ec4223f20a'))
  assert.equal(changed, true)
})

test('appendItemIdsToConversationMetadata preserves metadata when no bucket slots remain', () => {
  const metadata: Meta = {}
  for (let i = 0; i < 16; i += 1) {
    metadata[`meta${i}`] = 'value'
  }

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'resp',
    itemIds: ['item'],
  })

  assert.deepEqual(updated, metadata)
  assert.equal(changed, false)
})

test('appendItemIdsToConversationMetadata reuses bucket capacity efficiently', () => {
  const metadata: Meta = {
    foo: 'bar',
    responseItemsMap1: JSON.stringify([
      { responseId: 'resp-old', itemIds: ['item-old'] },
    ]),
    responseItemsMap5: JSON.stringify([
      { responseId: 'resp-older', itemIds: ['item-older'] },
    ]),
  }

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'resp-new',
    itemIds: ['item-new-1', 'item-new-2'],
  })

  const bucketKeys = normalizeBucketKeys(updated)
  assert.deepEqual(
    bucketKeys,
    bucketKeys.map((_, index) => `responseItemsMap${index}`),
    'bucket keys should be reindexed sequentially',
  )
  const payloads = bucketKeys.map((key) => JSON.parse(updated[key]!))
  const ids = payloads.flat().map((entry: { responseId: string }) => entry.responseId)
  assert.ok(ids.includes('resp-new'))
  assert.ok(ids.includes('resp-old'))
  assert.ok(ids.includes('resp-older'))
  assert.ok(metadataValuesWithinLimits(updated))
  assert.equal(changed, true)
})

test('appendItemIdsToConversationMetadata retains newest entries when a single bucket is available', () => {
  const metadata: Meta = {}
  for (let i = 0; i < 15; i += 1) {
    metadata[`meta${i}`] = `value${i}`
  }
  metadata.responseItemsMap3 = JSON.stringify([
    { responseId: 'resp-old-1', itemIds: [`old1-${MEDIUM_ITEM_SUFFIX}`] },
    { responseId: 'resp-old-2', itemIds: [`old2-${MEDIUM_ITEM_SUFFIX}`] },
  ])

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'resp-new',
    itemIds: [`new-${MEDIUM_ITEM_SUFFIX}`],
  })

  const keys = Object.keys(updated)
  assert.equal(keys.length, 16)
  const bucketKeys = normalizeBucketKeys(updated)
  assert.deepEqual(bucketKeys, ['responseItemsMap0'])

  const entries = bucketKeys.flatMap((key) => JSON.parse(updated[key]!))
  const responseIds = entries.map((entry: { responseId: string }) => entry.responseId)
  assert.ok(responseIds.includes('resp-new'))
  assert.ok(responseIds.includes('resp-old-2'))
  assert.ok(!responseIds.includes('resp-old-1'))
  assert.ok(metadataValuesWithinLimits(updated))
  assert.equal(changed, true)
})

test('appendItemIdsToConversationMetadata drops entries that would exceed metadata value limit', () => {
  const oversized = 'x'.repeat(600)

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata: {},
    responseId: 'resp-overflow',
    itemIds: [oversized],
  })

  assert.deepEqual(updated, {})
  assert.equal(changed, false)
})

test('appendItemIdsToConversationMetadata keeps existing map entries when new data cannot fit', () => {
  const metadata: Meta = {
    responseItemsMap0: JSON.stringify([
      { responseId: 'resp-old', itemIds: [`old-${MEDIUM_ITEM_SUFFIX}`] },
    ]),
  }

  const oversized = 'x'.repeat(600)
  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'resp-new',
    itemIds: [oversized],
  })

  assert.deepEqual(updated, metadata)
  assert.equal(changed, false)
})

test('appendItemIdsToConversationMetadata fits multiple buckets when space remains after non-map keys', () => {
  const metadata: Meta = {}
  for (let i = 0; i < 8; i += 1) {
    metadata[`meta${i}`] = `value${i}`
  }

  const existingEntries = [
    { responseId: 'resp-old-1', itemIds: [`old1-${MEDIUM_ITEM_SUFFIX}`] },
    { responseId: 'resp-old-2', itemIds: [`old2-${MEDIUM_ITEM_SUFFIX}`] },
  ]

  metadata.responseItemsMap2 = JSON.stringify(existingEntries)

  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata,
    responseId: 'resp-new',
    itemIds: [
      `new1-${MEDIUM_ITEM_SUFFIX}`,
      `new2-${MEDIUM_ITEM_SUFFIX}`,
      `new3-${MEDIUM_ITEM_SUFFIX}`,
    ],
  })

  const bucketKeys = normalizeBucketKeys(updated)
  assert.deepEqual(
    bucketKeys,
    bucketKeys.map((_, index) => `responseItemsMap${index}`),
    'buckets should be reindexed sequentially starting from 0',
  )
  assert.ok(bucketKeys.length <= 8, 'should not exceed remaining bucket capacity')

  const flattened = bucketKeys.flatMap((key) => JSON.parse(updated[key]!))
  const responseIds = flattened.map((entry: { responseId: string }) => entry.responseId)

  assert.ok(responseIds.includes('resp-new'))
  assert.ok(responseIds.includes('resp-old-2'))
  assert.ok(responseIds.includes('resp-old-1'))
  assert.ok(metadataValuesWithinLimits(updated))
  assert.equal(changed, true)
})

test('saveResponseItemsToConversationMetadata skips update when metadata unchanged', async () => {
  const metadata: Meta = {}
  for (let i = 0; i < 16; i += 1) {
    metadata[`meta${i}`] = `value${i}`
  }

  let updateCalled = false
  const client: any = {
    conversations: {
      retrieve: async () => ({ metadata }),
      update: async () => {
        updateCalled = true
      },
    },
  }

  await saveResponseItemsToConversationMetadata({
    client,
    threadId: 'thread-1',
    responseId: 'resp',
    itemIds: ['item'],
  })

  assert.equal(updateCalled, false)
})

test('saveResponseItemsToConversationMetadata updates when metadata changes', async () => {
  const metadata: Meta = {
    custom: 'value',
  }

  let updateCalled = false
  let updatedPayload: Record<string, unknown> | undefined
  const client: any = {
    conversations: {
      retrieve: async () => ({ metadata }),
      update: async (_threadId: string, payload: Record<string, unknown>) => {
        updateCalled = true
        updatedPayload = payload
      },
    },
  }

  await saveResponseItemsToConversationMetadata({
    client,
    threadId: 'thread-2',
    responseId: 'resp-new',
    itemIds: ['item-new'],
  })

  assert.equal(updateCalled, true)
  assert.ok(updatedPayload)
  const metadataPayload = updatedPayload?.metadata as Meta | undefined
  assert.ok(metadataPayload)
  const bucketKeys = Object.keys(metadataPayload!).filter((key) => key.startsWith('responseItemsMap'))
  assert.ok(bucketKeys.length > 0)
})
