import { useState } from 'react';
import { Check, Download, HardDrive, KeyRound, Monitor, Moon, Sun, Upload } from 'lucide-react';
import type { State, Preferences, Bridge } from '../shared/model';
import { api } from './lib';
import { Field, ErrorMessage } from './components';
export function Settings({
  state,
  onChanged,
  onMessage,
}: {
  state: State;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [secret, setSecret] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function prefs(update: Partial<Preferences>) {
    try {
      await api.preferences({ ...state.preferences, ...update });
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function transfer(action: Parameters<Bridge['transfer']>[0]['action']) {
    setBusy(true);
    setError('');
    try {
      onMessage(await api.transfer({ action }));
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <div className="settings-label">
          <Monitor size={20} />
          <h3>Appearance</h3>
          <p>A comfortable space for your collection.</p>
        </div>
        <div className="settings-content">
          <div className="theme-options">
            {[
              ['light', Sun, 'Light'],
              ['dark', Moon, 'Dark'],
              ['system', Monitor, 'Automatic'],
            ].map(([value, Icon, label]) => {
              const I = Icon as typeof Sun;
              return (
                <button
                  key={String(value)}
                  aria-pressed={state.preferences.theme === value}
                  className={`theme-option ${state.preferences.theme === value ? 'selected' : ''}`}
                  onClick={() => void prefs({ theme: value as Preferences['theme'] })}
                >
                  <div className={`theme-preview ${value}`}>
                    <div />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>
                    <I size={14} />
                    {String(label)}
                    {state.preferences.theme === value && <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="form-grid">
            <Field label="Metadata language">
              <select
                value={state.preferences.language}
                onChange={(e) =>
                  void prefs({ language: e.target.value as Preferences['language'] })
                }
              >
                <option value="en-US">English</option>
                <option value="zh-TW">繁體中文 · Traditional Chinese</option>
                <option value="zh-CN">简体中文 · Simplified Chinese</option>
                <option value="ja-JP">日本語 · Japanese</option>
                <option value="ko-KR">한국어 · Korean</option>
              </select>
            </Field>
            <Field label="Title display">
              <select
                value={state.preferences.titleDisplay}
                onChange={(e) =>
                  void prefs({ titleDisplay: e.target.value as Preferences['titleDisplay'] })
                }
              >
                <option value="localized">Localized title</option>
                <option value="original">Original title</option>
              </select>
            </Field>
            <Field label="Date display">
              <select
                value={state.preferences.dateFormat}
                onChange={(e) =>
                  void prefs({ dateFormat: e.target.value as Preferences['dateFormat'] })
                }
              >
                <option value="local">System locale</option>
                <option value="iso">YYYY-MM-DD</option>
              </select>
            </Field>
          </div>
          <small className="muted">
            The interface is in English. Metadata language applies to new searches and metadata
            refreshes.
          </small>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <KeyRound size={20} />
          <h3>Metadata connection</h3>
          <p>Search the world of movies and television.</p>
        </div>
        <div className="settings-content">
          <div className="section-heading">
            <h3>The Movie Database</h3>
            <span className={`connection ${state.configured ? 'connected' : ''}`}>
              <i />
              {state.configured ? 'Credential saved' : 'Not connected'}
            </span>
          </div>
          <p className="muted">
            Paste your TMDB API Read Access Token (recommended) or v3 API key. It stays on this
            computer, protected by your operating system.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api.credentials({ value: secret });
                setSecret('');
                await onChanged();
                onMessage('TMDB connected. You can now search and discover titles.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={state.configured ? 'Replace credential' : 'TMDB credential'}>
              <input
                aria-label="TMDB credential"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Paste your token or API key"
                required
                minLength={20}
              />
            </Field>
            <button className="primary" disabled={busy}>
              {busy ? 'Checking…' : state.configured ? 'Validate & replace' : 'Connect TMDB'}
            </button>
          </form>
          <p className="fine-print">
            Credentials are excluded from exports and backups. Local encryption cannot protect a
            token from software running with your user permissions.
          </p>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <HardDrive size={20} />
          <h3>Your data</h3>
          <p>Local, private, and always yours.</p>
        </div>
        <div className="settings-content">
          <div className="data-actions">
            <div>
              <strong>Export your collection</strong>
              <p>
                JSON preserves every field. CSV includes readable columns and complete records for
                re-import.
              </p>
            </div>
            <div className="button-row">
              <button disabled={busy} onClick={() => void transfer('export-json')}>
                <Download size={14} />
                JSON
              </button>
              <button disabled={busy} onClick={() => void transfer('export-csv')}>
                CSV
              </button>
            </div>
          </div>
          <div className="data-actions">
            <div>
              <strong>Import records</strong>
              <p>Merge a WatchLog JSON or CSV export. Existing records and preferences are kept.</p>
            </div>
            <button disabled={busy} onClick={() => void transfer('import')}>
              <Upload size={14} />
              Import
            </button>
          </div>
          <div className="data-actions">
            <div>
              <strong>Database backup</strong>
              <p>A complete SQLite copy. Store a backup somewhere safe.</p>
            </div>
            <button disabled={busy} onClick={() => void transfer('backup')}>
              Back up
            </button>
          </div>
          <div className="data-actions">
            <div>
              <strong>Restore a backup</strong>
              <p>
                Replaces the library after validation and confirmation. A safety copy is saved
                first.
              </p>
            </div>
            <button disabled={busy} onClick={() => void transfer('restore')}>
              Restore
            </button>
          </div>
          <div className="storage-path">
            <span className="eyebrow">DATABASE LOCATION</span>
            <code>{state.dataPath}\watchlog.sqlite</code>
            <small>
              Separate from your application and source code. Backups before imports and restores
              are stored in the backups subfolder.
            </small>
          </div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h3>About WatchLog</h3>
          <p>Version {state.versionName}</p>
        </div>
        <div className="settings-content about">
          <h3>Your life in stories.</h3>
          <p>A personal journal for the films and series that stay with you.</p>
          <button
            className="text-button tmdb-credit"
            onClick={() =>
              void api
                .external({ url: 'https://www.themoviedb.org' })
                .catch((e) => setError(e.message))
            }
          >
            <img src="./tmdb.svg" alt="The Movie Database" />
          </button>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          <p className="fine-print">
            Metadata and images are supplied by TMDB. TMDB scores and your personal ratings are
            labelled separately. IMDb is used for title identifiers and direct links. WatchLog does
            not scrape IMDb or provide IMDb ratings. Official IMDb dataset ingestion is not included
            in this version.
          </p>
        </div>
      </section>
      <ErrorMessage error={error} />
    </div>
  );
}
