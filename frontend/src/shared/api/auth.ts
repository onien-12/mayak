import { api } from './client';
import type { AuthResponse, Captcha, LoginInput, RegisterInput, UserMe } from './types';

export const authApi = {
  captcha: () => api.get<Captcha>('/auth/captcha'),
  register: (input: RegisterInput) => api.post<AuthResponse>('/auth/register', input),
  login: (input: LoginInput) => api.post<AuthResponse>('/auth/login', input),
  me: () => api.get<UserMe>('/auth/me'),
};
