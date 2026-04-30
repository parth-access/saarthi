export const validateEmailPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Missing payload' };
  }

  const { booking, therapist } = payload;

  if (!booking || typeof booking !== 'object') {
    return { valid: false, error: 'Missing booking in payload' };
  }

  if (!booking.email || !booking.name || !booking.date || !booking.time) {
    return { valid: false, error: 'Missing required booking fields' };
  }

  return { valid: true, error: null, booking, therapist };
};
