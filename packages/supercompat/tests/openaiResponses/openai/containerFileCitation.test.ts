import { describe, test } from 'node:test'
import { strict as assert } from 'node:assert'
import { serializeItemAsMessage } from '../../../src/lib/items/serializeItemAsMessage'

describe('container file citations', () => {
  test('preserves container_id separately from file_id', () => {
    const text = '[Download](sandbox:/mnt/data/report.pdf)'
    const url = 'sandbox:/mnt/data/report.pdf'
    const start = text.indexOf(url)
    const serialized = serializeItemAsMessage({
      item: {
        id: 'msg_container_file',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text,
            annotations: [
              {
                type: 'container_file_citation',
                container_id: 'cntr_report',
                file_id: 'cfile_report',
                filename: 'report.pdf',
                start_index: start,
                end_index: start + url.length,
              },
            ],
          },
        ],
      } as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'assistant_test' },
      createdAt: 0,
    })

    const annotation = (serialized.content[0] as any).text.annotations[0]
    assert.deepEqual(annotation.file_path, {
      file_id: 'cfile_report',
      container_id: 'cntr_report',
    })
  })

  test('keeps regular file_path annotations backward compatible', () => {
    const serialized = serializeItemAsMessage({
      item: {
        id: 'msg_regular_file',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: 'Download',
            annotations: [
              {
                type: 'file_path',
                text: '',
                start_index: 0,
                end_index: 0,
                file_path: { file_id: 'file_regular' },
              },
            ],
          },
        ],
      } as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'assistant_test' },
      createdAt: 0,
    })

    const annotation = (serialized.content[0] as any).text.annotations[0]
    assert.deepEqual(annotation.file_path, { file_id: 'file_regular' })
  })
})
