import * as React from "react"
import { motion, AnimatePresence } from "motion/react"

const quotes = [
  "You don’t have to figure everything out today.",
  "Healing takes time, and that’s okay.",
  "You are allowed to pause.",
  "Small steps still move you forward.",
  "You are doing better than you think.",
  "It’s okay to not be okay sometimes.",
  "Your feelings are valid."
];

export const QuoteRotator = () => {
  const [index, setIndex] = React.useState(-1); // -1 represents "Your Safe Space"
  
  React.useEffect(() => {
    // Initial delay of 2.5 seconds before starting rotation
    const initialTimer = setTimeout(() => {
      setIndex(0);
      
      // Start rotating every 3.5 seconds
      const rotationInterval = setInterval(() => {
        setIndex((prev) => (prev + 1) % quotes.length);
      }, 3500);

      return () => clearInterval(rotationInterval);
    }, 2500);

    return () => clearTimeout(initialTimer);
  }, []);

  const currentText = index === -1 ? "Your Safe Space" : quotes[index];

  return (
    <div className="mt-8 mb-10 min-h-[2rem] flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={currentText}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="text-lg md:text-xl font-medium text-primary tracking-wider italic"
        >
          {currentText}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};
