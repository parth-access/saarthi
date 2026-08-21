import { auth } from '../lib/firebase/client';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const currentUser = auth?.currentUser;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (currentUser) {
    const token = await currentUser.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  options.headers = { ...headers, ...options.headers };
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }
  
  return data;
}

export const paymentService = {
  createOrder: async (bookingId: string) => {
    return await fetchWithAuth('/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId })
    });
  },
  verifyPayment: async (payload: { bookingId: string, razorpay_payment_id: string, razorpay_order_id: string, razorpay_signature: string }) => {
    return await fetchWithAuth('/api/payment/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  reportPaymentFailure: async (payload: { bookingId?: string; orderId?: string; reason?: string }) => {
    try {
      return await fetchWithAuth('/api/payment/fail', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      // Best-effort failure reporting
      return { success: false };
    }
  }
};
