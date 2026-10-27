// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  resetPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => h.params }));
vi.mock('next/link', () => ({
  default: (props: { href: string; children?: React.ReactNode }) => React.createElement('a', { href: props.href }, props.children),
}));
vi.mock('@/services/betterAuthService', () => ({ betterAuthService: { resetPassword: h.resetPassword } }));
vi.mock('@/services/authService', () => ({ authService: { requestPasswordReset: h.requestPasswordReset } }));

import ResetPassword from './page';
import ForgotPassword from '../forgot-password/page';

let root: Root;
let container: HTMLDivElement;

async function render(el: React.ReactElement) {
  await act(async () => {
    root.render(el);
  });
}

function type(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.params = new URLSearchParams();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('/reset-password', () => {
  it('explains an expired link and offers a new one', async () => {
    h.params = new URLSearchParams('error=INVALID_TOKEN');
    await render(<ResetPassword />);
    expect(container.textContent).toContain('This link has expired');
    expect(container.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it('treats a missing token as expired', async () => {
    await render(<ResetPassword />);
    expect(container.textContent).toContain('This link has expired');
  });

  it('refuses mismatched passwords without calling the server', async () => {
    h.params = new URLSearchParams('token=tok');
    await render(<ResetPassword />);
    type('reset-password', 'newpass123');
    type('reset-password-confirm', 'newpass124');
    await submit();
    expect(container.textContent).toContain("The two passwords don't match.");
    expect(h.resetPassword).not.toHaveBeenCalled();
  });

  it('resets with the token and sends the user to sign in', async () => {
    h.params = new URLSearchParams('token=tok');
    h.resetPassword.mockResolvedValue(undefined);
    await render(<ResetPassword />);
    type('reset-password', 'newpass123');
    type('reset-password-confirm', 'newpass123');
    await submit();
    expect(h.resetPassword).toHaveBeenCalledWith('tok', 'newpass123');
    expect(container.textContent).toContain('Password updated');
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('says so when the server rejects the token', async () => {
    h.params = new URLSearchParams('token=old');
    h.resetPassword.mockRejectedValue(new Error('Invalid token'));
    await render(<ResetPassword />);
    type('reset-password', 'newpass123');
    type('reset-password-confirm', 'newpass123');
    await submit();
    expect(container.textContent).toContain('expired or was already used');
  });
});

describe('/forgot-password', () => {
  it('confirms without revealing whether the account exists', async () => {
    h.requestPasswordReset.mockResolvedValue(undefined);
    await render(<ForgotPassword />);
    type('forgot-email', '  a@x.com ');
    await submit();
    expect(h.requestPasswordReset).toHaveBeenCalledWith('a@x.com');
    expect(container.textContent).toContain('If an account exists for a@x.com');
  });

  it('explains rate limiting', async () => {
    h.requestPasswordReset.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/too-many-requests' }));
    await render(<ForgotPassword />);
    type('forgot-email', 'a@x.com');
    await submit();
    expect(container.textContent).toContain('Too many attempts');
  });
});
