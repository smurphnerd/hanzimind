import { Button, Html, Markdown } from "@react-email/components";


export function MagicLinkEmail(props: { link: string; }) {
  return (
    <Html>
      <Markdown>Click the button below to sign in.</Markdown>
      <Button href={props.link}>Sign in</Button>
    </Html>
  );
}

export default async function Preview() {
  return (
    <MagicLinkEmail
      link="https://example.com"
    />
  );
}

