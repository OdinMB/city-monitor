import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { isolate } from '../../lib/bidi.js';
import { setupLabel } from '../../lib/setup-labels.js';
import {
  MAX_CUSTOM_SETUPS, canAddSetup, isStandardSetup, nextSetupName, shownCustom, type NamedSetup, type SetupId, type SetupView,
} from '../../lib/setup-state.js';
import type { ResolvedSection, StandardSetup } from '../../lib/tile-setups.js';
import { SourceText } from '../SourceText.js';
import { Popover } from './Popover.js';
import { BAR_BUTTON } from './SetupControls.js';
import { ShareSetupButton } from './ShareSetupButton.js';

/**
 * The one way into the tile setups: a button naming the setup shown
 * ("Customize · Functional") that opens a menu with the two standard setups
 * and what each is for, the visitor's own setups (show, edit, delete), a new
 * setup, sharing the view, and a line on where all this is kept. The menu is
 * a non-modal dialog (`Popover`): focus moves into it, and Escape closes it
 * and returns focus to the button. A full-width panel on phones.
 */

const STANDARD: readonly StandardSetup[] = ['functional', 'topics'];

const ITEM =
  'w-full min-h-8 rounded px-2 py-1.5 text-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const ROW_BUTTON =
  'shrink-0 min-h-6 rounded px-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer';

function Check() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** A visitor's setup name runs in its own direction, as it may be in any script; a blank one shows the default name. */
function OwnName({ setup }: { setup: Pick<NamedSetup, 'name'> }) {
  const { t } = useTranslation();
  return setup.name.trim() ? <SourceText>{setup.name}</SourceText> : <>{t('setup.custom')}</>;
}

function StandardItem({ id, current, onPick }: { id: StandardSetup; current: boolean; onPick: (id: SetupId) => void }) {
  const { t } = useTranslation();
  const nameId = useId();
  const descriptionId = useId();
  return (
    <li>
      <button type="button" className={ITEM} aria-current={current ? 'true' : undefined} aria-labelledby={nameId} aria-describedby={descriptionId} onClick={() => onPick(id)}>
        <span className="flex items-center gap-1.5 font-medium">
          <span id={nameId}>{t(`setup.${id}`)}</span>
          {current && <Check />}
        </span>
        <span id={descriptionId} className="block text-xs text-muted">{t(`setup.description.${id}`)}</span>
      </button>
    </li>
  );
}

function MenuContent({ view, shown, close }: { view: SetupView; shown: readonly ResolvedSection[]; close: () => void }) {
  const { t } = useTranslation();
  const choose = useTileSetup((s) => s.choose);
  const startEditing = useTileSetup((s) => s.startEditing);
  const deleteSetup = useTileSetup((s) => s.deleteSetup);
  const newSetup = useTileSetup((s) => s.newSetup);
  const firstItem = useRef<HTMLUListElement>(null);
  const yoursId = useId();
  const newId = useId();
  const canAdd = canAddSetup(view);

  const pick = (id: SetupId) => {
    choose(id);
    close();
  };
  const edit = (id: NamedSetup['id']) => {
    startEditing(id);
    close();
  };
  const remove = (setup: NamedSetup) => {
    if (!window.confirm(t('setup.deleteConfirm', { name: isolate(setupLabel(t, setup)) }))) return;
    deleteSetup(setup.id);
    // Its row goes; focus stays in the menu.
    firstItem.current?.querySelector('button')?.focus();
  };
  const create = () => {
    newSetup(shown, nextSetupName(view, t('setup.custom')));
    close();
  };

  return (
    <div className="space-y-2 p-2 text-sm">
      <ul ref={firstItem} className="space-y-0.5">
        {STANDARD.map((id) => (
          <StandardItem key={id} id={id} current={view.choice === id} onPick={pick} />
        ))}
      </ul>
      {view.customSetups.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p id={yoursId} className="px-2 pb-1 text-xs font-semibold text-muted">{t('setup.yourSetups')}</p>
          <ul aria-labelledby={yoursId} className="space-y-0.5">
            {view.customSetups.map((setup) => {
              const name = setupLabel(t, setup);
              const current = view.choice === setup.id;
              return (
                <li key={setup.id} className="flex items-center gap-1">
                  <button type="button" className={`${ITEM} flex min-w-0 items-center gap-1.5 font-medium`} aria-current={current ? 'true' : undefined} onClick={() => pick(setup.id)}>
                    <span className="truncate"><OwnName setup={setup} /></span>
                    {current && <Check />}
                  </button>
                  <button type="button" className={ROW_BUTTON} aria-label={t('setup.editSetup', { name })} onClick={() => edit(setup.id)}>
                    {t('setup.edit')}
                  </button>
                  <button type="button" className={ROW_BUTTON} aria-label={t('setup.deleteSetup', { name })} onClick={() => remove(setup)}>
                    {t('setup.delete')}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="space-y-0.5 border-t border-border-subtle pt-2">
        <button type="button" className={`${ITEM} font-medium`} disabled={!canAdd} aria-labelledby={newId} aria-describedby={`${newId}-hint`} onClick={create}>
          <span id={newId}>{t('setup.newSetup')}</span>
          <span id={`${newId}-hint`} className="block text-xs font-normal text-muted">
            {canAdd ? t('setup.newSetupHint') : t('setup.setupLimit', { max: MAX_CUSTOM_SETUPS })}
          </span>
        </button>
        <ShareSetupButton view={view} className={`${ITEM} font-medium`} />
      </div>
      <p className="border-t border-border-subtle px-2 pt-2 text-xs text-muted">
        {t('setup.cookieNote')}{' '}
        <Link to="/privacy" className="text-link hover:underline">{t('setup.privacy')}</Link>
      </p>
    </div>
  );
}

/** `triggerId` names the button, so setup mode's Done can hand focus back to it. */
export function SetupMenu({ view, shown, triggerId }: { view: SetupView; shown: readonly ResolvedSection[]; triggerId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const custom = shownCustom(view);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('setup.label')}
      renderTrigger={(ref, props) => (
        <button ref={ref as React.Ref<HTMLButtonElement>} id={triggerId} type="button" {...props} className={`${BAR_BUTTON} max-w-full gap-1.5`}>
          {t('setup.customize')}{' '}
          <span aria-hidden="true">·</span>{' '}
          <span className="min-w-0 truncate font-semibold">
            {custom ? <OwnName setup={custom} /> : setupLabel(t, isStandardSetup(view.choice) ? view.choice : 'functional')}
          </span>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
      className="w-[calc(100vw-1rem)] sm:w-96 max-h-[70vh] overflow-y-auto bg-surface-1 border border-border rounded-lg shadow-lg"
    >
      <MenuContent view={view} shown={shown} close={() => setOpen(false)} />
    </Popover>
  );
}
