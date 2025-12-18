interface Frame {
  object_name: string;
  csv_name: string;
  arrow_name?: string;
  last_modified?: string;
  size?: number;
}

interface OpenDirectReviewParams {
  frame: Frame;
  setProcessingTarget: (frame: Frame | null) => void;
  setProcessingColumns: (columns: any[]) => void;
  setProcessingError: (error: string) => void;
  setProcessingLoading: (loading: boolean) => void;
}

export const openDirectReview = async ({
  frame,
  setProcessingTarget,
  setProcessingColumns,
  setProcessingError,
  setProcessingLoading,
}: OpenDirectReviewParams): Promise<void> => {
  try {
    if (!frame || !frame.object_name) {
      console.error('[openDirectReview] Invalid frame provided');
      return;
    }

    // Verify all required functions are available
    if (typeof setProcessingTarget !== 'function') {
      console.error('[openDirectReview] setProcessingTarget is not a function');
      return;
    }
    if (typeof setProcessingColumns !== 'function') {
      console.error('[openDirectReview] setProcessingColumns is not a function');
      return;
    }
    if (typeof setProcessingError !== 'function') {
      console.error('[openDirectReview] setProcessingError is not a function');
      return;
    }
    if (typeof setProcessingLoading !== 'function') {
      console.error('[openDirectReview] setProcessingLoading is not a function');
      return;
    }

    // Set the processing target and reset state
    setProcessingTarget(frame);
    setProcessingColumns([]);
    setProcessingError('');
    setProcessingLoading(true);
    
    console.log('[openDirectReview] Opening processing modal for file:', frame.arrow_name || frame.csv_name);
  } catch (error) {
    console.error('[openDirectReview] Error in openDirectReview:', error);
    throw error;
  }
};

