import { ReactNode, RefObject } from "react";
import { ThDockingKeys, ThSheetHeaderVariant } from "@/preferences/models";
import { ActionsStateKeys } from "@/lib/actionsReducer";

export interface StatefulSheet {
  id: ActionsStateKeys;
  triggerRef: RefObject<HTMLElement | null>;
  heading: string;
  headerVariant?: ThSheetHeaderVariant;
  className?: string;
  underlayClassName?: string;
  headerClassName?: string;
  /** Added to the sheet body, e.g. so content can drop its padding and run edge to edge. */
  bodyClassName?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClosePress: () => void;
  onBackPress?: () => void;
  docker?: ThDockingKeys[];
  children?: ReactNode;
  resetFocus?: unknown;
  focusWithinRef?: RefObject<HTMLElement | null>;
  focusSelector?: string;
  scrollTopOnFocus?: boolean;
  dismissEscapeKeyClose?: boolean;
  isNonModal?: boolean;
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
}
