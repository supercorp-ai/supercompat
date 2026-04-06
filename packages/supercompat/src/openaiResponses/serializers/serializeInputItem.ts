export const serializeInputItem = ({
  item,
  index,
}: {
  item: any
  index: number
}) => {
  if (typeof item === 'string') {
    return {
      id: `input_${index}`,
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: item }],
    }
  }

  return {
    id: item.id ?? `input_${index}`,
    ...item,
  }
}
