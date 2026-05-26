import { toast } from 'sonner';

export function useGlobalError() {
  const handleError = (error: unknown, customMessage?: string) => {
    console.error('Global Error Handler:', error);
    
    let message = customMessage || 'An unexpected error occurred.';
    
    if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object' && 'response' in error && (error as { response?: { data?: { error?: string } } }).response?.data?.error) {
      message = (error as { response?: { data?: { error?: string } } }).response!.data!.error!;
    } else if (error instanceof Error) {
      message = error.message;
    }

    toast.error(message, {
      description: 'Please try again or contact support if the issue persists.',
    });
  };

  const handleSuccess = (message: string) => {
    toast.success(message);
  };

  return { handleError, handleSuccess };
}
