"use client";

import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

import ArrowDropDownIcon from "@/core/Components/Settings/ThDropdown/assets/icons/arrow_drop_down.svg";

import sourceSelectorStyles from "./assets/styles/thorium-web.reader.sourceSelector.module.css";

import { useI18n } from "@/i18n/useI18n";

import type { ReaderSourceSelection } from "./Reader/ReaderNavigationContext";

export const StatefulReaderSourceSelector = ({
  items,
  selectedId,
  isLoading = false,
  disabled = false,
  onSelect,
  label,
}: ReaderSourceSelection) => {
  const { t } = useI18n();

  if (items.length < 2) return null;

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const ariaLabel = label ?? t("reader.app.header.sources.label");

  return (
    <div
      className={ sourceSelectorStyles.root }
      data-loading={ isLoading || undefined }
    >
      <Select
        className={ sourceSelectorStyles.select }
        selectedKey={ selected?.id }
        onSelectionChange={ (key) => {
          if (key == null) return;
          const nextId = String(key);
          if (nextId !== selectedId) onSelect(nextId);
        } }
        isDisabled={ disabled || isLoading }
        aria-label={ ariaLabel }
      >
        <Button className={ sourceSelectorStyles.trigger }>
          <SelectValue className={ sourceSelectorStyles.value }>
            { () => (
              <span className={ sourceSelectorStyles.valueText }>
                { selected?.label }
              </span>
            ) }
          </SelectValue>
          { isLoading ? (
            <span
              className={ sourceSelectorStyles.spinner }
              role="status"
              aria-label={ t("reader.app.header.sources.loading") }
            />
          ) : (
            <ArrowDropDownIcon
              className={ sourceSelectorStyles.chevron }
              aria-hidden="true"
              focusable="false"
            />
          ) }
        </Button>

        <Popover
          className={ sourceSelectorStyles.popover }
          placement="bottom end"
        >
          <div className={ sourceSelectorStyles.listHeading }>
            { t("reader.app.header.sources.available") }
          </div>
          <ListBox
            className={ sourceSelectorStyles.listbox }
            items={ items }
            aria-label={ t("reader.app.header.sources.available") }
          >
            { (item) => (
              <ListBoxItem
                id={ item.id }
                textValue={
                  item.description
                    ? `${ item.label } ${ item.description }`
                    : item.label
                }
                className={ sourceSelectorStyles.item }
              >
                <span className={ sourceSelectorStyles.itemLabel }>
                  { item.label }
                </span>
                { item.description ? (
                  <span className={ sourceSelectorStyles.itemDescription }>
                    { item.description }
                  </span>
                ) : null }
              </ListBoxItem>
            ) }
          </ListBox>
        </Popover>
      </Select>
    </div>
  );
};
