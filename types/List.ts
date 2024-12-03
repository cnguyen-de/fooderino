export interface List {
  id: number;
  name: string;
  users: ListUser;
  admin: string;
}

export interface ListUser {
  email: string;
  name: string;
  avatar: string;
}
