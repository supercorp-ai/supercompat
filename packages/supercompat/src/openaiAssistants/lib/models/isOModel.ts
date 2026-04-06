export const isOModel = ({ model }: { model: string }) => (
  model.startsWith('o1') || model.startsWith('o3')
)
