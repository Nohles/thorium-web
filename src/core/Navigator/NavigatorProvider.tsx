import { createContext, useContext } from "react";

interface NavigatorContextValue {
  navigator: any;
}

const NavigatorContext = createContext<NavigatorContextValue | null>(null);

interface NavigatorProviderProps {
  navigator: any;
  children: React.ReactNode;
}

export const NavigatorProvider = ({ navigator, children }: NavigatorProviderProps) => {
  return (
    <NavigatorContext.Provider value={{ navigator }}>
      { children }
    </NavigatorContext.Provider>
  );
}

export const useNavigatorContext = () => {
  const context = useContext(NavigatorContext);
  if (!context) {
    throw new Error("Navigator hooks must be used within NavigatorProvider");
  }
  return context.navigator;
}

export const useOptionalNavigatorContext = () => {
  const context = useContext(NavigatorContext);
  return context?.navigator ?? null;
}