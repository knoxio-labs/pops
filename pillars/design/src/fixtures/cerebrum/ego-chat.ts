/** A fictional conversation row used by the Ego history layout preview. */
export interface EgoConversationFixture {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
}

export const egoChatFixture = {
  conversations: [
    {
      id: 'desk-layout',
      title: 'Make room for a desk',
      preview: 'A 120 cm desk should fit beside the window…',
      updatedAt: '10:42 am',
    },
    {
      id: 'weekly-planning',
      title: 'Plan the week',
      preview: 'Three priorities and two errands to group…',
      updatedAt: 'Yesterday',
    },
    {
      id: 'meal-ideas',
      title: 'Quick dinner ideas',
      preview: 'Use the lentils and vegetables already in…',
      updatedAt: 'Monday',
    },
  ] satisfies EgoConversationFixture[],
  prompt: 'How can I make room for a desk in my office?',
  response: 'Start by measuring the desk and keeping a clear path to the door.',
  partialResponse: 'Start by measuring the desk and keeping a clear path',
  suggestions: ['Plan my week', 'Find a note I saved', 'Help me make a decision'],
} as const;
