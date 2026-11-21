export interface WithholdingPreviewState<Preview, Input> {
  preview: Preview | null;
  withholdingInput: Input | null;
}

export type WithholdingPreviewStateAction<Preview, Input> =
  | { type: 'input-changed' }
  | { type: 'calculated'; preview: Preview; withholdingInput: Input };

export function reduceWithholdingPreviewState<Preview, Input>(
  _state: WithholdingPreviewState<Preview, Input>,
  action: WithholdingPreviewStateAction<Preview, Input>,
): WithholdingPreviewState<Preview, Input> {
  if (action.type === 'input-changed') {
    return { preview: null, withholdingInput: null };
  }
  return { preview: action.preview, withholdingInput: action.withholdingInput };
}
