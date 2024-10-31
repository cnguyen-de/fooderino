export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    // This will be an object representation of the html template.
    console.log(html);
    html.head.push(`<link rel="manifest" href="/manifest.webmanifest">`);
  });
  // You can also intercept the response here.
  nitroApp.hooks.hook('render:response', (response, { event }) => {});
});
