"use client";

import React from "react";

import { HTMLAttributesWithRef } from "../customTypes";
import { Link } from "react-aria-components";

export interface ThRunningHeadProps extends HTMLAttributesWithRef<HTMLHeadingElement> {
  ref?: React.RefObject<HTMLHeadingElement>
  label: string;
  href?: string;
}

export const ThRunningHead = ({ 
  ref,
  label,
  href,
  ...props
}: ThRunningHeadProps) => {

  return(
    <>
    <h1 
      ref={ ref }
      { ...props }
    >
        { href ? <Link href={ href }>{ label }</Link> : label }
      </h1>
    </>
  )
}
