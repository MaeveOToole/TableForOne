export function preparationSteps(instructions: string[]) {
  return instructions.map((step) =>
    step.replace(/\bHeat (?:the )?oven to /gi, 'Preheat the oven to '),
  );
}
