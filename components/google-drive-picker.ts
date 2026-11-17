type GoogleFile = { id: string; name: string; resourceKey?: string };
type PickerResponse = {
  action: string;
  docs?: GoogleFile[];
};
type DocsView = {
  setMode: (mode: string) => DocsView;
  setEnableDrives: (enabled: boolean) => DocsView;
};
type PickerBuilder = {
  addView: (view: DocsView) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setOrigin: (origin: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};
type PickerLibrary = {
  DocsView: new () => DocsView;
  DocsViewMode: { LIST: string };
  PickerBuilder: new () => PickerBuilder;
};

let pickerLoading: Promise<PickerLibrary> | undefined;

function loadPicker() {
  if (pickerLoading) return pickerLoading;
  const browser = window as Window & {
    gapi?: {
      load: (
        name: string,
        options: { callback: () => void; onerror: () => void },
      ) => void;
    };
    google?: { picker?: PickerLibrary };
  };
  if (browser.google?.picker) return Promise.resolve(browser.google.picker);
  pickerLoading = new Promise<PickerLibrary>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Google Picker could not load. Try again."));
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.src = "https://apis.google.com/js/api.js";
    script.onerror = fail;
    script.onload = () => {
      browser.gapi?.load("picker", {
        callback: () => {
          window.clearTimeout(timeout);
          if (browser.google?.picker) resolve(browser.google.picker);
          else fail();
        },
        onerror: fail,
      });
    };
    document.head.append(script);
  }).catch((error) => {
    pickerLoading = undefined;
    throw error;
  });
  return pickerLoading;
}

export async function pickGoogleFile(config: {
  token: string;
  key: string;
  appId: string;
}) {
  const picker = await loadPicker();
  return new Promise<GoogleFile | null>((resolve, reject) => {
    const dialog = new picker.PickerBuilder()
      .addView(new picker.DocsView().setMode(picker.DocsViewMode.LIST))
      .addView(
        new picker.DocsView()
          .setMode(picker.DocsViewMode.LIST)
          .setEnableDrives(true),
      )
      .setAppId(config.appId)
      .setOrigin(window.location.origin)
      .setDeveloperKey(config.key)
      .setOAuthToken(config.token)
      .setCallback((data) => {
        if (data.action === "picked") resolve(data.docs?.[0] ?? null);
        if (data.action === "cancel") resolve(null);
        if (data.action === "error") {
          reject(new Error("Google Picker could not open Drive. Try again."));
          dialog.setVisible(false);
        }
      })
      .build();
    dialog.setVisible(true);
  });
}
