import { useNavigatorContext, useOptionalNavigatorContext } from "../NavigatorProvider";

// Visual Navigator Hook (specific to visual navigators)
export const useVisualNavigator = () => {
  const navigator = useNavigatorContext();
  
  if (!navigator.goLink || !navigator.goForward) {
    throw new Error("Provided navigator does not support visual navigation");
  }
  
  return navigator;
}

export const useNavigator = () => {
  return useNavigatorContext();
}

export const useOptionalNavigator = () => {
  return useOptionalNavigatorContext();
}