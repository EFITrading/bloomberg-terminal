import { create } from 'zustand';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatState {
  isOpen: boolean;
  messages: Message[];
  isLoading: boolean;
  model: string;
  setIsOpen: (isOpen: boolean) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setIsLoading: (isLoading: boolean) => void;
  setModel: (model: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  model: 'gpt-4-turbo',
  setIsOpen: (isOpen) => set({ isOpen }),
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
        },
      ],
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setModel: (model) => set({ model }),
  clearMessages: () => set({ messages: [] }),
}));
