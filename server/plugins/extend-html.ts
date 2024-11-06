export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    // This will be an object representation of the html template.
    html.head.push(`<link rel="manifest" href="/manifest.webmanifest">`);
    html.head.push(
      `<script defer src="https://cloud.umami.is/script.js" data-website-id="33fa216d-5188-4249-b6ea-391e4aae906d"></script>`
    );
  });
  // You can also intercept the response here.
  nitroApp.hooks.hook('render:response', (response, { event }) => {});
});
