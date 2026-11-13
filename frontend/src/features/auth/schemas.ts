import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Введите корректный e-mail'),
  password: z.string().min(1, 'Введите пароль'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  display_name: z.string().trim().min(2, 'Минимум 2 символа').max(40, 'Не длиннее 40 символов'),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,24}$/, '3–24 символа: латинские буквы, цифры и «_»'),
  email: z.email('Введите корректный e-mail'),
  password: z.string().min(8, 'Минимум 8 символов'),
  captcha_answer: z.string().trim().min(1, 'Ответьте на вопрос'),
  /** Honeypot: real users never see or fill it. */
  website: z.string(),
});

export type RegisterValues = z.infer<typeof registerSchema>;
