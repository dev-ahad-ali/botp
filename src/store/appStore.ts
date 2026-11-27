import { create } from 'zustand';

export type FlowStage = 'idle' | 'signup' | 'email-code' | 'phone' | 'done';

type AppState = {
  tab: string;
  serviceUrl: string;
  tempUrl: string;
  service: string;
  email: string;
  code: string;
  phone: string;
  stage: FlowStage;
  running: boolean;
  setTab: (tab: string) => void;
  setServiceUrl: (url: string) => void;
  setTempUrl: (url: string) => void;
  setService: (service: string) => void;
  setEmail: (email: string) => void;
  setCode: (code: string) => void;
  setPhone: (phone: string) => void;
  setStage: (stage: FlowStage) => void;
  setRunning: (running: boolean) => void;
  resetFlow: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  tab: 'config',
  serviceUrl: '',
  tempUrl: '',
  service: 'Service',
  email: '',
  code: '',
  phone: '',
  stage: 'idle',
  running: false,
  setTab: (tab) => set({ tab }),
  setServiceUrl: (serviceUrl) => set({ serviceUrl }),
  setTempUrl: (tempUrl) => set({ tempUrl }),
  setService: (service) => set({ service }),
  setEmail: (email) => set({ email }),
  setCode: (code) => set({ code }),
  setPhone: (phone) => set({ phone }),
  setStage: (stage) => set({ stage }),
  setRunning: (running) => set({ running }),
  resetFlow: () => set({ email: '', code: '', phone: '', stage: 'idle' }),
}));
