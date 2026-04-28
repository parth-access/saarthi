const handleSlotSelect = async (time: string) => {
  setLockingTime(time);

  const result = await lockSlot({
    therapistId: bookingData.therapistId,
    date: bookingData.date,
    time,
  });

  if (result.success) {
    setBookingData(prev => ({ ...prev, time }));
    setActiveLockId(result.data?.lockId || null);

    setTimeout(() => {
      handleNext();
      setLockingTime(null);
    }, 300);
  } else {
    setLockingTime(null);
    setSubmitError(result.error || "Slot is no longer available");
  }
};