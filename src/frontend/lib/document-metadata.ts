export function setDocumentMetadata(title: string, description: string) {
  document.title = title;
  let descriptionElement = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const createdDescription = !descriptionElement;
  const previousDescription = descriptionElement?.content;

  if (!descriptionElement) {
    descriptionElement = document.createElement('meta');
    descriptionElement.name = 'description';
    document.head.append(descriptionElement);
  }
  descriptionElement.content = description;

  return () => {
    if (createdDescription) descriptionElement?.remove();
    else if (descriptionElement && previousDescription !== undefined) descriptionElement.content = previousDescription;
  };
}
